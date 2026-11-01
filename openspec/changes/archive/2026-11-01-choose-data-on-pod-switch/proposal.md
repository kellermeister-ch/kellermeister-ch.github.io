## Why

When the user logs in with a different WebID than the one last used on the device, the app only offers one outcome: the local data is deleted and the data of the new Pod is loaded. A user who wants to move their cellar to a new Pod, for example a new account or provider, has no way to do so. They can only throw the local data away.

## What Changes

- On a WebID switch, the user chooses which data to keep instead of only confirming the deletion. There are three choices:
  - **Keep the Pod's data:** local data is deleted and the new Pod's data is loaded. This is the current behaviour.
  - **Keep the local data:** the Kellermeister data on the new Pod is erased, and the local data is moved to the new Pod and uploaded with the next sync.
  - **Cancel:** nothing changes, as today.
- **BREAKING (data):** choosing "keep the local data" permanently deletes the Kellermeister data (cellars, bottles, products, orders) on the new Pod. Nothing else on the Pod is touched, including the Kellermeister order inbox. The previous Pod is not touched either.
- The choice is made at the same two points as the confirmation today: before the login flow when the WebID is known, otherwise once the session is established. A choice made before the login flow is not asked again afterwards.
- The "keep the local data" switch can be resumed: if it is interrupted, the next sync completes it before anything is uploaded, and the Pod's old data never mixes with the local data.
- The dialog shows how much local data there is (cellars and bottles), so the user does not keep an empty local store by mistake.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `identity-scoped-local-data`: the warn-and-delete switch becomes a choice between the local data and the Pod's data. New requirements cover erasing the new Pod's Kellermeister data, moving the local data to the new Pod, and resuming an interrupted switch.

## Impact

- `src/application/identity/SwitchIdentity.ts`: switch with a chosen outcome (`keep-pod` / `keep-local`).
- `src/application/ports/AppStateStore.ts` and its IndexedDB/localStorage implementation:
  - the remembered choice replaces the remembered confirmation;
  - a persisted marker for a pending Pod replacement, holding the WebID and the previous Pod base.
- `src/application/sync/SynchronizeWithPod.ts`: completes a pending Pod replacement before syncing.
- `src/application/ports/SyncService.ts` / `src/infrastructure/solid/SolidSyncService.ts`: a new operation does three things:
  - moves the local data from the old Pod's URLs to the new Pod's;
  - erases the Kellermeister collections on the Pod;
  - marks all local documents as not yet synced.
- `src/infrastructure/web/pages/landing-page.ts`: the switch dialog offers the choice.
- Tests:
  - unit tests for the switch decision, the sync ordering and the Pod replacement;
  - an e2e test that switches from the seeded `edwin` account to the seeded `empty` account. It needs credentials for that second account.
