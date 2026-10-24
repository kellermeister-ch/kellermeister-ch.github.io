# Proposal

## Why

A Pod sync can take a long time, especially the first one on a device, which pulls every bottle, wine, order and cellar document one by one. During that time the only feedback is a pulsing dot and the label "Synchronisiert…". The user can't tell whether the sync is progressing, how much is left, or whether it's stuck.

## What Changes

- A sync progress dialog opens while a sync runs and shows:
  - the current step (e.g. "Profil laden", "Lokale Daten vorbereiten", "Abgleich mit dem Pod", "Änderungen hochladen")
  - an overall progress bar with a percentage
  - one row per synced container (Keller, Weine, Flaschen, Bestellungen), each with its own bar and a `done/total` document count. The total shows once the container listing has been read; until then it shows `…`.
- The dialog can be sent to the background ("Im Hintergrund"). The app stays usable and the sync keeps running.
- On success the dialog shows that the sync is complete and closes on its own shortly after. On failure it stays open with the error message until the user closes it.
- Short syncs (e.g. a no-op sync of a few hundred milliseconds) don't flash the dialog: it only appears if the run is still going after a short delay.
- The dialog is app-wide, so it also appears for the remembered sync that runs after login, and on any page.
- The sync status reported to the UI gains an optional progress snapshot. The existing `idle` / `syncing` / `error` states and the last-sync time are unchanged.

## Capabilities

### New Capabilities

- `sync-progress`: how sync progress is reported (current step, overall share, per-container document counts) and how the progress dialog presents it, can be dismissed, and closes.

### Modified Capabilities

_None._ The `pod-synchronization` requirements (what is synced, when, and the status states) stay as they are. This change only adds progress reporting on top.

## Impact

- `src/application/ports/SyncService.ts`, `src/application/sync/SyncCoordinator.ts`: a progress type, a progress callback on `synchronize`, and progress in `SyncStatus`.
- `src/infrastructure/solid/SolidSyncService.ts`: reports steps, and runs soukai-bis's `Sync` job as an instance so its progress events and status tree can be read.
- A new pure mapping from soukai-bis's job status tree to the app's progress type, with unit tests.
- A new Lit component `sync-progress-dialog`, mounted once from `main.ts` next to the router outlet.
- e2e: the login helper waits for the dialog to close, and a new spec checks the dialog during the post-login sync.
- Dependency risk: the per-container counts read soukai-bis's job status tree, which isn't a documented API, and soukai-bis is pinned to a `next` build. The overall percentage uses the documented `onUpdated` event and keeps working if the tree shape changes.
