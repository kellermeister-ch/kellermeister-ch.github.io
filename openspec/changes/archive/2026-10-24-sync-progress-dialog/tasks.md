# Tasks

## 1. Progress model and coordinator

- [x] 1.1 Add `SyncStep`, `ContainerProgress` and `SyncProgress` to `src/application/ports/SyncService.ts`. Give `SyncService.synchronize` an optional `onProgress` callback, and pass it through in `SynchronizeWithPod.execute`. Verify `npx tsc --noEmit` passes and the existing fakes in `*.test.ts` still compile unchanged.
- [x] 1.2 Add `progress: SyncProgress | null` to `SyncStatus` in `SyncCoordinator`:
  - Set an initial snapshot (step `profile`, 0 %, four containers with `total: null`) when a run starts.
  - Update it from the callback and notify listeners.
  - Set it to `null` when the run ends, on success or error.
  - Verify with new cases in `SyncCoordinator.test.ts`: progress events reach listeners while `syncing`; progress is `null` after success and after error; a coalesced follow-up run starts again from the initial snapshot.

## 2. Reading progress from soukai-bis

- [x] 2.1 Add a pure `toSyncProgress(status, overall, collections, previousOverall)` next to `SolidSyncService.ts` (e.g. `syncProgressFromJob.ts`), following design decision 2. Verify with unit tests on synthetic status trees:
  - containers not yet listed → `total null`
  - partly done → correct `done/total`
  - a completed empty container → `0/0`
  - pull complete → step `push`
  - the overall share never decreases
  - an unexpected shape → overall only, no containers
- [x] 2.2 In `SolidSyncService.synchronize`:
  - Report the steps `profile`, `prepare` and `finish` around the existing phases.
  - Replace `Sync.run(...)` with `new Sync(config)` plus listeners plus `await job.start()`, and attach `job.completed.catch(() => {})`.
  - On each `onUpdated`, report `toSyncProgress(job.serialize(), …)`.
  - Keep `onFinished` collecting `synced`, and iterate `APPLICATION_MODELS` for both the type index and the mapping.
  - Verify `npm test` passes, including `SolidSyncService.test.ts`, and that `e2e/specs/sync-requests.spec.ts` still passes with no change in request counts.

## 3. Dialog

- [x] 3.1 Create `src/infrastructure/web/components/sync-progress-dialog.ts`, following design decisions 5 and 6:
  - shows after 500 ms, sends the run to the background, closes 1.5 s after success, stays open on error with "Schliessen"
  - German step and row labels; `…` while a total is unknown
  - styled like the existing overlays
  - Put the show/hide logic in a pure function (or small class) with Vitest tests: short run never shows; long run shows; dismissed run stays hidden but the next run shows; success closes after the delay; error stays open.
- [x] 3.2 Mount `<sync-progress-dialog>` once, appended to `document.body` from `main.ts` (`kellermeister-app` is never defined as an element; see design decision 5). In `npm run dev`, press Sync on a Pod with data, and verify that:
  - the dialog shows the step, the overall bar and four container rows with counts
  - "Im Hintergrund" hides it while the status line still says "Synchronisiert…"
  - it closes by itself after success
  - it appears on any page

## 4. e2e

- [x] 4.1 Make `e2e/helpers/login.ts` wait until the sync progress dialog is gone before returning. If needed, do the same in `e2e/specs/sync-requests.spec.ts` before the next click. Verify `npm run test:e2e` passes as before.
- [x] 4.2 Add `e2e/specs/sync-progress.spec.ts`. During the post-login sync of the seed Pod it asserts that:
  - the dialog becomes visible with rows Keller, Weine, Flaschen and Bestellungen
  - at least one row shows a `n/m` count
  - the dialog closes on its own after the sync
  - it stays hidden for the rest of that run after "Im Hintergrund" is pressed, if the run is long enough to try
  - Assert run-time values, not fixed seed counts. Verify `npm run test:e2e -- sync-progress` passes.

## Workflow follow-up

- e2e failures that existed before this change (none involve the dialog; seen in the full run on 2026-10-24):
  - `inbox-ingestion` and `photo-order-capture` click a landing button "Kellerarbeit", but the cellarwork cellar has been labelled "Eingang" since commit `69e0213`.
  - `rating-on-bottle` passes alone, but fails after `cellar-bottle-count` has moved a Hütte bottle on the shared e2e Pod (ordering dependency).
  - "other views' headers are unchanged" hits the known jump back to "/" after a full page load (see the `fixme` in `cellar-bottle-count.spec.ts`).
- Update the `soukai-bis-migration` memory note: the progress rows depend on the `Sync` job's status tree (`serialize()`), and must be re-checked on every soukai-bis upgrade.
- Archive with `openspec archive sync-progress-dialog --yes` once implemented and verified.
