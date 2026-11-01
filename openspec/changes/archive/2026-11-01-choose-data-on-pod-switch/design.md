## Context

Today:

- `SwitchIdentity.check(webId)` returns `proceed` or `wipe-required`. `switchTo(webId)` wipes the local store through `LocalDataStore.wipe()` and then records the WebID.
- `landing-page.ts` asks for confirmation at two points:
  - before the OIDC redirect (`confirmIdentitySwitchIfNeeded`). The confirmation is remembered as `AppStateStore.confirmedIdentitySwitch = webId`, so it is not asked again after the redirect.
  - after the session is established (`adoptIdentity`). After a wipe the page reloads.
- Local documents carry absolute URLs of the Pod they were synced with (`{oldBase}bottles/…#it`). Only never-synced documents are under `local://`. `SolidSyncService.rehome` migrates `local://` → base with soukai-bis `MigrateLocalUrls` (a generic prefix migration) plus `fixCellarReferences`, because `cellarUrl` is a string literal.
- soukai-bis `Sync` pushes a local document without a last-modified baseline through `createDocument`. A document whose baseline is set is assumed to exist on the Pod.
- The Pod container base (`{storage}private/kellermeister/v1/`) is resolved per session and persisted. `LocalDataStore.wipe()` clears it together with the domain data and the session metadata.

## Goals / Non-Goals

**Goals:**
- The user chooses between keeping the Pod's data (today's wipe) and keeping the local data.
- Keeping the local data results in the new Pod holding exactly the local data, with all references rewritten to the new Pod.
- Each step can be interrupted and resumed safely, and nothing is uploaded before the new Pod's old data is gone.

**Non-Goals:**
- Merging local and Pod data (a third option). Not requested, and it raises conflict questions.
- Touching the previous Pod, or deleting anything outside the four Kellermeister collections on the new Pod.
- Other devices already logged in with the new WebID. Their next sync may upload their own local copies again. This is documented under Risks; handling it would need tombstones on the Pod.
- First login on a device (no recorded WebID): the merge behaviour stays unchanged.

## Decisions

### 1. The choice is a value, remembered like the confirmation today

- `SwitchIdentity.switchTo(webId, choice: "keep-pod" | "keep-local")`. `check()` keeps its shape, renamed to `{kind: "choice-required", previousWebId}`.
- `AppStateStore.confirmedIdentitySwitch: string | null` becomes `identitySwitchChoice: {webId, choice} | null`. It is scoped to one WebID, as before.
- The landing page's two prompt points stay where they are; only the dialog content changes.

Alternative: ask only after the session is established. Rejected: the user would leave the app for the login without knowing what will happen. The spec already requires asking in advance.

### 2. "Keep local" = record a pending replacement; the Pod work happens in the sync

`switchTo(webId, "keep-local")` writes nothing to any Pod. It does three things, in this order:

1. Persists `pendingPodReplacement = {webId, fromBase}`, where `fromBase` is the current persisted Pod base. If no base is persisted, `fromBase` is null: only `local://` documents exist, and `rehome` already covers them.
2. Clears the persisted Pod base (in memory too), the last-sync date and the per-session sync state. The domain data is kept.
3. Records the new WebID.

It also remembers a pending sync (`PendingSync`), so that the replacement completes right after login.

The Pod work needs an authenticated session and the new Pod's resolved base, and both exist only in a sync. `SynchronizeWithPod.execute` therefore runs these steps:

1. Read `pendingPodReplacement`. If it is set and its WebID is not the session's WebID, abort with an error, before any Pod access.
2. If it is set: `sync.replacePod(fromBase)`.
3. Clear `pendingPodReplacement`.
4. `sync.synchronize()`, the normal re-home, pull and push.

`SolidSyncService.replacePod(fromBase)` makes three changes:

- **a. Move the local data to the new Pod's URLs.** It runs a subclass of `MigrateLocalUrls` with `{[fromBase]: base}` that also rewrites string literals holding a migrated URL. These are bottles' `cellarUrl` and its values in the CRDT operation history. It then drops the emptied containers of the previous Pod. This is idempotent: a second run finds nothing under `fromBase`. The literals are rewritten at the RDF level rather than by re-saving bottles through the model, as `rehome`'s `fixCellarReferences` does for `local://`. The reason: documents written by older app versions carry no CRDT metadata, and saving such a model fails. The e2e run found both problems, a crash on such bottles and old-Pod literals left in the history.
- **b. Erase the new Pod's Kellermeister collections.** For each of `cellars/`, `products/`, `bottles/`, `orders/` under `base`, it reads the container listing and deletes every member document through the remote engine. The containers themselves and the `inbox` are not touched. This is idempotent.
- **c. Mark every local document of the four collections as never synced** (no last-modified baseline), so `Sync` pushes each one through `createDocument`.

Why this order is safe:

- Until step 3 of `execute` clears the marker, nothing has been pushed. Re-running a–c after an interruption only erases data that was already on the new Pod before the switch.
- After step 3, an interrupted push is an ordinary partial sync: unpushed documents still have no baseline and are created, and pushed ones are skipped.
- a precedes b, so local URLs never point to the old Pod while the new Pod is half-erased. Either order is safe for the Pod, because no push happens before step 3.
- Nothing is pulled before b, so the new Pod's old data never reaches the local store.

Alternatives considered:

- **Do the Pod work in the landing page right after login.** Rejected: it duplicates sync plumbing (engine, base resolution), and an interruption would not be resumed by anything.
- **Do the work inside `SolidSyncService.synchronize` and read the marker there.** Rejected: the infrastructure would read app state. Keeping the decision in the application use case matches how `SynchronizeWithPod` already owns cache invalidation.
- **Erase the old Pod-URL documents and re-create them as `local://`, so that the existing `rehome` handles them.** Rejected: it doubles the rewrites, and `rehome` would run before the erase.

### 3. Resetting baselines

Step c uses soukai-bis's `purgeMetadata({documentUrls})`. Both `IndexedDBEngine` and `InMemoryEngine` implement it, and it removes exactly the last-modified baseline. Step c does not rely on `MigrateLocalUrls` happening to write documents without one. A unit test checks that no local collection document keeps a baseline.

### 5. Duplicate well-known cellars after detaching

Detaching the local data from the Pod base means the next start runs without a resolved base. The cellar bootstrap then creates provisional well-known cellars (`local://cellars/altglass`, `…/cellarwork`), although the local store already holds their Pod copies. The regular re-home would then try to move the provisional copies onto those taken URLs, and every sync would fail after the erase, before any upload. (The walk-through of task 3.1 found this.)

`SolidSyncService.rehome` therefore drops a provisional well-known cellar whenever its Pod copy is already stored locally. Both copies stand for the same cellar, and a bottle that refers to the provisional URL is still rewritten to the Pod copy by the `cellarUrl` fixup. The check runs on every sync, so it also repairs a store that is already in this state.

### 6. No sync before the session's WebID is adopted

`main.ts` runs a remembered sync right after the session is restored, and so does the reconnect path. Both can start while the landing page is still settling a switch. At that point the Pod base in memory may still be the previous identity's, and a "keep local" marker may already be recorded while the base is not yet detached. A sync in that window could erase the previous Pod.

`SynchronizeWithPod` therefore refuses (`IdentityNotAdoptedError`) unless the session's WebID is the recorded one. `SwitchIdentity` writes the WebID last, so the switch is complete by then. `PendingSync.run` waits in the same situation and keeps the remembered request, so the sync after the switch still runs.

### 4. Dialog

The dialog keeps its title "Andere WebID" and shows the local counts ("N Keller, M Flaschen"). It has three buttons:

- **"Daten aus dem Pod übernehmen":** deletes the local data.
- **"Lokale Daten behalten":** the Pod's Kellermeister data is deleted.
- **"Abbrechen".**

The text states what each choice deletes. It also tells the user to cancel and sync first if they have local changes for the previous Pod. The two destructive buttons have equal visual weight, so neither looks like the safe default.

## Risks / Trade-offs

- **[Choosing "keep local" by mistake erases a Pod's cellar]** → The dialog shows the local counts and names the new WebID. The previous Pod still holds the synced local data, so nothing is lost overall unless local changes were unsynced, and the dialog already warns about that.
- **[Another device of the new WebID re-uploads the erased data]** → Documented as a limitation in the proposal; the dialog does not mention it. That device would have to be wiped or switched as well.
- **[soukai-bis baseline handling differs from expectations]** → Covered by the unit test in task 2.1 and by the e2e test, which asserts the Pod contents after the switch.
- **[Large local store: many DELETEs and creates in one sync]** → The sync progress dialog reports per-collection progress for the push. The replacement itself (migration and erase) runs before the sync's own steps, so the dialog shows its first step while it runs.
- **[A fresh account's profile has no `pim:storage`]** → This is existing app behaviour: the app alerts and logs out. Providers normally set the triple; the e2e helper adds it to accounts it creates on the throwaway Pod.

## Migration Plan

- A remembered `confirmedIdentitySwitch` string from an older version is read as `{webId, choice: "keep-pod"}`, which matches its old meaning.
- No data migration.
- Rollback: an older version ignores `pendingPodReplacement`. A pending "keep local" switch would then run a normal sync, which merges instead of replacing. This is acceptable for a rollback window.
