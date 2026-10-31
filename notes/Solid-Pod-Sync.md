❯ The solid pod sync runs differently for safari on macos and for safari on iphone. On macos the sync operation makes just 4 calls to the 4 containers, but on iphone a call for
every document is made, also if the a sync was just done before (withou any changes within the pod). What could be the reason for this?        
===

Listed 1 directory, ran 4 shell commands

● Looking at soukai-bis's sync code, I see it skips documents by comparing the Pod's container timestamp against one cached in IndexedDB. Next, I'll check how that timestamp is
stored and parsed, since that's likely where iOS/macOS Safari diverge.

Searched for 2 patterns, ran 4 shell commands

● I've traced a likely cause: soukai-bis's merge path assigns a guessed timestamp to a document that never ends up matching the Pod again. Now I'll check what that path returns
when there's nothing to upload.

Searched for 1 pattern, ran 4 shell commands

● Most likely this isn't a difference between Safari on iPhone and Safari on macOS. It's the data the iPhone has stored locally, and a weakness in soukai-bis's sync that keeps
that data from ever repairing itself. I found this by reading the code and haven't confirmed it on your iPhone yet.

How sync decides to skip a document

When the sync lists a container on the Pod, the listing includes each document's change date. soukai-bis compares that with the change date it stored in IndexedDB for the
document (Sync.skipDocumentPull). If they are within 1 second of each other, it skips the document. That's why your Mac makes only the 4 container calls.

Why some devices fetch every document, every time

A document that exists both locally and on the Pod, with stored dates that don't match, goes through soukai-bis's merge step instead (syncDocumentContents). If nothing needs
uploading, soukai-bis has no reply from the Pod to take the real change date from (SolidEngine.updateDocument returns null). It then stores a guess, which is the time the sync
ran. The next sync compares the Pod's real date with that guess, they don't match, and the document is fetched and merged again. That stores a new guess, and so on forever.
"No changes on the Pod" doesn't help, because the Pod's date is never the problem.

This is the same flaw reconcileWellKnownCellarBaselines in SolidSyncService.ts already works around, but only for the two cellars "Eingang" and "Altglass".

How the iPhone likely got into this state

Your Mac's local data was probably filled by a clean first download, which stores the correct dates. The iPhone's local data probably wasn't: it may have had data before its
first sync, a sync may have been cut off, or it may still hold data from an older app version. Once a document is in this state, it stays there. This also explains the earlier
case of 2000+ requests that went away after clearing the browser data.

How to confirm it

Connect the iPhone to the Mac, open Safari's Develop menu, select the iPhone, and look at IndexedDB kellermeister → documents. If lastModifiedAt for a bottle is roughly the
time of your last sync rather than the date in the Pod's container listing, this is the cause.

What to do about it
1. Quick fix for the iPhone: delete the app's website data on the phone and sync again; a clean download stores the correct dates. Only do this if the iPhone has no changes
   that haven't reached the Pod yet, because those would be lost.
2. Fix in the app: extend the existing cellar workaround to all 4 containers. After a successful sync, copy the Pod's real change date into the local data for every document
   already marked as synced. Documents with local changes not yet uploaded are left alone, so those still get uploaded. That repairs affected devices on their next sync and
   also covers future cases. I'd add a unit test for it and keep the existing e2e check that a sync with no changes fetches no documents.
3. It's worth reporting upstream to soukai-bis as well. When a merge uploads nothing, it should store the date of the document it just read from the Pod
   (remoteDocument.getLastModified()) instead of a guess.

Option 2 works: a browser stuck in the iPhone's state recovers after one sync and then makes only the container calls. Both e2e tests pass against the real Pod. The type-check
is clean and all 289 unit tests pass.

What the e2e test shows

The new test puts the browser into the iPhone's state, where every stored change date is a guessed sync time. It then syncs twice:

┌─────────────────────────────┬───────────────────┬────────────────────┬────────┐
│            Sync             │ Document requests │ Container requests │ Writes │
├─────────────────────────────┼───────────────────┼────────────────────┼────────┤
│ Before the fix (stale data) │ 1340              │ 8                  │ 1      │
├─────────────────────────────┼───────────────────┼────────────────────┼────────┤
│ Next sync                   │ 0                 │ 5                  │ 0      │
└─────────────────────────────┴───────────────────┴────────────────────┴────────┘

The 1340 are one per document (cellars 5, products 264, bottles 955, orders 116), which matches what the iPhone does. A device that's already healthy is unchanged: 4 container
calls, no document requests and no writes, the same as before.

How it works

After every sync, the app copies the Pod's real change date onto each document whose stored date the sync just changed. If the sync changed nothing, nothing is read, so a sync
with no changes costs no extra requests. Two rules keep a change from being missed:
- Local edits: a document with changes not yet uploaded is left alone, so those changes are still uploaded.
- Recent Pod changes: if the Pod's date is later than the start of the sync, the document is left alone. That version could be someone else's change made during the sync, and
  it still needs to be downloaded.

Changes
- src/infrastructure/solid/syncBaselines.ts (new): alignChangedBaselines, with 7 unit tests in syncBaselines.test.ts. Removing either rule makes its test fail; I checked both.
- src/infrastructure/solid/SolidSyncService.ts: remembers the stored dates and the start time before the sync, and runs the alignment afterwards. It replaces the old
  cellar-only workaround reconcileWellKnownCellarBaselines, which this now covers.
- e2e/specs/sync-requests.spec.ts: the new healing test, plus a tighter limit of 4 container calls for a sync with no changes.

Two things I noticed in the run
- One upload while healing: the first sync uploaded one bottle (bottles/5d326e42…). Once forced to compare every document in full, soukai-bis found an edit that existed only
  in the local copy. That's correct sync behaviour, so the test no longer requires zero writes on that sync.
- One extra container call: the sync after healing made 5 container calls instead of 4. That's because the uploaded bottle's stored date was adjusted once more. I expect it to
  settle at 4 on the following sync, but the test didn't run that far.

On your iPhone: the first sync after you deploy this will still fetch every document once. From then on it should make only the 4 container calls.

The test runs wrote to the e2e Pod data in the working tree (that one bottle upload). Nothing is committed.