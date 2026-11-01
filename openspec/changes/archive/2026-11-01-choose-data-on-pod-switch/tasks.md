## 1. Switch decision and app state

- [x] 1.1 Replace `AppStateStore.confirmedIdentitySwitch` with `identitySwitchChoice: {webId, choice} | null` (reading a legacy string as `keep-pod`) and add `pendingPodReplacement: {webId, fromBase} | null`, in the port, the implementation and `appStateStore.fake.ts`; verify with unit tests for round-trip and legacy read (`npm test`)
- [x] 1.2 Extend `SwitchIdentity`: `check()` returns `choice-required`; `switchTo(webId, "keep-pod")` keeps today's wipe; `switchTo(webId, "keep-local")` persists the pending replacement with the current Pod base, clears Pod base / last-sync date (keeping domain data), records the WebID and remembers a pending sync; update `SwitchIdentity.test.ts` and `identity-switch.test.ts` for both choices and the write order; verify with `npm test`

## 2. Pod replacement in the sync

- [x] 2.1 Add `SyncService.replacePod(fromBase)` and implement it in `SolidSyncService`: migrate local URLs `fromBase` → base (IRIs and `cellarUrl` literals at the RDF level, see 5.3), delete all member documents of the four collection containers on the Pod via the remote engine, and leave all local collection documents without a last-modified baseline; unit-test with `InMemoryEngine` local and remote engines (references rewritten, only the four collections erased and the inbox kept, baselines absent, idempotent on re-run); verify with `npm test`
- [x] 2.2 In `SynchronizeWithPod.execute`, run `replacePod` before `synchronize` when a pending replacement exists for the session's WebID, clear the marker in between, and refuse to sync when it belongs to another WebID; unit-test the ordering, the resume after a failure in `replacePod`, and the WebID guard with fakes; verify with `npm test`

## 3. Choice dialog

- [x] 3.1 Turn the landing page's switch dialog into the choice (local counts, what each option deletes, "Daten aus dem Pod übernehmen" / "Lokale Daten behalten" / "Abbrechen"), remember the choice before the OIDC redirect and pass it to `switchTo` in `adoptIdentity` (reload after both choices); verify with `npm run build` and by walking through both prompt points in the running app

## 4. End-to-end

- [x] 4.1 Add `e2e/specs/pod-switch.spec.ts`, which creates its own second account on the throwaway e2e Pod (CSS account API, `createAccount` in `e2e/helpers/pod.ts`) instead of needing credentials for the seeded `empty` account:
  - log in as `edwin`, switch to the new account choosing "keep local", and assert on disk that the second Pod's collections hold exactly the local documents, its own Kellermeister data is erased, no reference points to `edwin`'s Pod, and `edwin`'s Pod files are unchanged;
  - a second test switches choosing "keep Pod" and asserts the local data is gone and neither Pod received anything;
  - verify with `npm run test:e2e -- pod-switch`
- [x] 4.2 Run the existing `sync-requests` and `cellar-huette` e2e tests to confirm normal login and no-op sync are unchanged

## 5. Findings from the walk-through

- [x] 5.1 Drop provisional well-known cellars whose Pod copy is stored locally before re-homing (design §5); unit test in `SolidSyncService.test.ts` reproduces the "already in use" failure; verify with `npm test`
- [x] 5.2 Refuse to sync, and keep a remembered sync, while the session's WebID is not the recorded one (design §6); unit tests in `SynchronizeWithPod.test.ts` and `PendingSync.test.ts`; verify with `npm test`
- [x] 5.3 Migrate `cellarUrl` literals (including the operation history) at the RDF level and drop the previous Pod's emptied containers (design §2a), so legacy bottles without CRDT metadata are migrated and no local term refers to the previous Pod; unit tests for a legacy bottle and for a history holding old cellar literals; verify with `npm test`

