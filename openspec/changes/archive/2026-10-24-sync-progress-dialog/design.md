# Design

## Context

How a sync runs today:

- `SyncCoordinator.run()` calls `SynchronizeWithPod.execute()`, which calls `SolidSyncService.synchronize()`. The UI only learns `idle` / `syncing` / `error` through `onStatusChange`.
- `SolidSyncService.synchronize()` runs in this order:
  1. load the profile (`fetchProfile`)
  2. re-home provisional resources (`rehome`)
  3. `Sync.run(...)` from soukai-bis
  4. align the well-known cellar baselines

What soukai-bis's `Sync` job offers (pinned `next` build, `dist/jobs/sync/Sync.js`):

- **`onUpdated(progress)`** (documented `JobListener`): a number from 0 to 1, rounded to 2 decimals, emitted only when the rounded value changes. Pull is weighted 90 %, push 10 %. `Sync.run(config)` forwards `config.onUpdated`.
- **`job.serialize()`** (public): returns the job's status tree.
  - `{root, completed, children: [pull, push]}`
  - `pull.children[i]` is one entry per registered container, in type-index registration order. `buildTypeIndex` registers in `APPLICATION_MODELS` order: cellars, products, bottles, orders.
  - Each container entry gets `children` (one `{completed}` per document) once its listing has been read.
  - A document is marked `completed` in `syncDocument`'s `finally`, so skipped (unchanged) and failed documents count too.
- **`Sync.run` doesn't return the job.** To call `serialize()` we construct `new Sync(config)` ourselves, add listeners, and `await job.start()`.

## Goals / Non-Goals

**Goals:**
- Keep the progress model in the application layer and free of soukai-bis types. The UI depends only on that model.
- Keep the code that reads soukai-bis internals in one small, pure, unit-tested function.

**Non-Goals:**
- No cancel button. soukai-bis has `cancel()`, but cancelling halfway leaves a partly synced state. That needs its own spec.
- No per-container detail for the push phase. Push is 10 % of the job and usually tiny; it appears as a step and in the overall bar.
- No change to when syncs run (`pod-synchronization` stays as it is).
- No progress for the steps before `Sync` (profile, re-home). They appear as named steps, and the overall bar stays at 0 % during them.

## Decisions

### 1. Progress model in the application layer

Defined in `src/application/ports/SyncService.ts`:

```ts
type SyncStep = "profile" | "prepare" | "pull" | "push" | "finish";
interface ContainerProgress { collection: "cellars" | "products" | "bottles" | "orders"; done: number; total: number | null; }
interface SyncProgress { step: SyncStep; overall: number /* 0..1 */; containers: ContainerProgress[]; }
```

- `SyncService.synchronize(onProgress?: (p: SyncProgress) => void)`.
- `SynchronizeWithPod.execute` passes the callback through.
- `SyncCoordinator` stores the latest value as `SyncStatus.progress: SyncProgress | null`. It resets it to an initial snapshot at run start and sets it to `null` when the run ends, and notifies listeners as it does today.
- German labels ("Keller", "Weine", …) belong in the UI, not in this model.

### 2. Reading per-container progress from the job's status tree

`SolidSyncService` builds `new Sync(config)` and adds a listener. On each `onUpdated(progress)` it calls `toSyncProgress(job.serialize(), progress, collections)`:

- **Pull containers:** `pull.children[i]` maps to `APPLICATION_MODELS[i].collection`.
  - `total` = `children.length`, or `null` when there are no children and the container isn't completed yet.
  - `done` = the number of completed children.
  - A container entry that is completed with no children is reported as `total 0, done 0`.
- **Step:** `pull` until `children[0].completed`, then `push`.
- **Overall:** `max(previous, progress)`, so it never goes down.

If the tree doesn't have the expected shape (e.g. after a soukai-bis upgrade), the function returns the overall share with empty container rows instead of throwing. The UI then shows only the bar.

Alternative considered: wrapping the `SolidEngine` to count container listings and document reads ourselves. Rejected: it duplicates the job's skip and recursion logic, and the counts would drift from what the job actually does.

### 3. Event volume

`onUpdated` fires only when the rounded overall value changes, so at most about 100 updates per run. Container counts are read only on those events, so they move in steps of about 1 %. That's smooth enough and needs no throttling. A bigger first sync just means more documents between updates.

### 4. Running the job with `start()` instead of `Sync.run`

`start()` emits progress before and after `run()`, which gives a clean 0 % and 100 %. When the run fails it also rejects `job.completed`. We attach `job.completed.catch(() => {})` so this doesn't become an unhandled rejection; the error still propagates from `await job.start()`. `onFinished` still fires from inside `run()`, so `synced` is collected the same way as now.

### 5. One app-wide dialog component

`sync-progress-dialog` is mounted once from `main.ts`, appended to `document.body` next to the router outlet, so route changes don't remove it. (`<kellermeister-app>` looked like the natural place, but it is never defined as a custom element. It's an inert outlet, so its template never renders, and activating it would change the app's root element.) It subscribes to `SyncCoordinator.onStatusChange` and works as a small state machine per run:

- **syncing:** start a 500 ms timer. When it fires and the run is still going, open the dialog, unless the user dismissed this run.
- **idle after an open dialog:** show "Abgeschlossen" at 100 %, then close after 1.5 s.
- **error after an open dialog:** stay open with the error message and a "Schliessen" button.
- **error before the dialog opened:** don't open it. The existing status line already shows "Fehler".

A run is identified by a counter that goes up on each `idle/error → syncing` transition. "Im Hintergrund" records the current run number as dismissed.

Styling follows the existing overlays (`rating-overlay` in `cellar-page`, the footer's dialogs): fixed backdrop, centred card, the app's primary colour for the bars. Row labels: cellars → Keller, products → Weine, bottles → Flaschen, orders → Bestellungen.

### 6. Step labels

| Step | Label |
| --- | --- |
| `profile` | Profil laden |
| `prepare` | Lokale Daten vorbereiten |
| `pull` | Abgleich mit dem Pod |
| `push` | Änderungen hochladen |
| `finish` | Abschluss |

## Risks / Trade-offs

- [The soukai-bis status tree isn't a documented API and could change on upgrade] → Only `toSyncProgress` reads it. Its unit tests pin the expected shape, and it falls back to the overall bar alone. The memory note on the soukai-bis migration should mention this dependency.
- [Container row order depends on the type-index registration order] → `buildTypeIndex` and the mapping both iterate the same `APPLICATION_MODELS` array. A unit test asserts the order.
- [The dialog covers the page during the post-login sync in e2e] → The login helper waits for the dialog to be gone before returning. Specs that sync explicitly (`sync-requests.spec.ts`) wait the same way.
- [Totals appear late for big containers, so the bar for Flaschen jumps from `…` to `0/842`] → Expected and spec'd (`…` until the listing is read).
