import {describe, it, expect, vi} from "vitest";
import {SynchronizeWithPod} from "./SynchronizeWithPod.ts";
import {IdentityNotAdoptedError, NotAuthenticatedError, PendingSwitchMismatchError} from "../errors.ts";
import {fakeAppState} from "./appStateStore.fake.ts";
import type {AuthService, SolidSession} from "../ports/AuthService.ts";
import type {SyncService} from "../ports/SyncService.ts";
import type {ReadModelCache} from "../ports/ReadModelCache.ts";

const ALICE = "https://alice.pod/profile#me";
const BOB = "https://bob.pod/profile#me";
const OLD_BASE = "https://bob.pod/private/kellermeister/v1/";

const session: SolidSession = {isLoggedIn: true, webId: ALICE, fetch};
const loggedIn: AuthService = {isLoggedIn: () => true, getSession: () => session};
const loggedOut: AuthService = {isLoggedIn: () => false, getSession: () => ({isLoggedIn: false, webId: null, fetch})};

/** A SyncService that records its calls in `events`. */
function recordingSync(events: string[], options: {failReplace?: boolean; failSync?: boolean} = {}): SyncService {
    return {
        replacePod: async (fromBase) => {
            events.push(`replace:${fromBase}`);
            if (options.failReplace) {
                throw new Error("Pod unreachable");
            }
        },
        synchronize: async () => {
            events.push("sync");
            if (options.failSync) {
                throw new Error("network down");
            }
            return {reconciled: 3};
        },
    };
}

function fakeCache(): ReadModelCache & {invalidate: ReturnType<typeof vi.fn>} {
    return {invalidate: vi.fn()};
}

describe("SynchronizeWithPod", () => {

    it("drops the cached read models after a successful sync", async () => {
        const cache = fakeCache();

        await expect(new SynchronizeWithPod(loggedIn, recordingSync([]), fakeAppState({webId: ALICE}).store, cache).execute())
            .resolves.toEqual({reconciled: 3});

        expect(cache.invalidate).toHaveBeenCalledOnce();
    });

    it("keeps the caches when the sync fails (nothing was reconciled for sure)", async () => {
        const cache = fakeCache();

        await expect(new SynchronizeWithPod(loggedIn, recordingSync([], {failSync: true}), fakeAppState({webId: ALICE}).store, cache).execute())
            .rejects.toThrow("network down");

        expect(cache.invalidate).not.toHaveBeenCalled();
    });

    it("does not touch the caches without a session", async () => {
        const cache = fakeCache();

        await expect(new SynchronizeWithPod(loggedOut, recordingSync([]), fakeAppState({webId: ALICE}).store, cache).execute())
            .rejects.toBeInstanceOf(NotAuthenticatedError);

        expect(cache.invalidate).not.toHaveBeenCalled();
    });

    it("works without a cache", async () => {
        await expect(new SynchronizeWithPod(loggedIn, recordingSync([]), fakeAppState({webId: ALICE}).store).execute())
            .resolves.toEqual({reconciled: 3});
    });

    it("syncs nothing for a session whose WebID is not adopted yet", async () => {
        const events: string[] = [];
        // Mid-switch: the recorded identity is still the previous one.
        const app = fakeAppState({webId: BOB, pendingPodReplacement: {webId: ALICE, fromBase: OLD_BASE}});

        await expect(new SynchronizeWithPod(loggedIn, recordingSync(events), app.store).execute())
            .rejects.toBeInstanceOf(IdentityNotAdoptedError);

        expect(events).toEqual([]);
        expect(app.getPendingPodReplacement()).toEqual({webId: ALICE, fromBase: OLD_BASE});
    });

    describe("with a pending Pod replacement", () => {

        it("replaces the Pod's data, clears the marker, and only then syncs", async () => {
            const events: string[] = [];
            const app = fakeAppState({webId: ALICE, pendingPodReplacement: {webId: ALICE, fromBase: OLD_BASE}});
            const store = {
                ...app.store,
                setPendingPodReplacement: async (pending: null) => {
                    events.push(`marker:${pending}`);
                    await app.store.setPendingPodReplacement(pending);
                },
            };

            await new SynchronizeWithPod(loggedIn, recordingSync(events), store).execute();

            expect(events).toEqual([`replace:${OLD_BASE}`, "marker:null", "sync"]);
            expect(app.getPendingPodReplacement()).toBeNull();
        });

        it("keeps the marker and syncs nothing when the replacement fails, so the next sync resumes it", async () => {
            const events: string[] = [];
            const app = fakeAppState({webId: ALICE, pendingPodReplacement: {webId: ALICE, fromBase: OLD_BASE}});
            const cache = fakeCache();

            await expect(new SynchronizeWithPod(loggedIn, recordingSync(events, {failReplace: true}), app.store, cache).execute())
                .rejects.toThrow("Pod unreachable");

            expect(events).toEqual([`replace:${OLD_BASE}`]);
            expect(app.getPendingPodReplacement()).toEqual({webId: ALICE, fromBase: OLD_BASE});
            // Local documents may already have moved, so cached read models are stale.
            expect(cache.invalidate).toHaveBeenCalled();

            // Next sync: the replacement runs again, then the sync.
            await new SynchronizeWithPod(loggedIn, recordingSync(events), app.store, cache).execute();
            expect(events).toEqual([`replace:${OLD_BASE}`, `replace:${OLD_BASE}`, "sync"]);
            expect(app.getPendingPodReplacement()).toBeNull();
        });

        it("does not replace again when the upload after it fails", async () => {
            const events: string[] = [];
            const app = fakeAppState({webId: ALICE, pendingPodReplacement: {webId: ALICE, fromBase: OLD_BASE}});

            await expect(new SynchronizeWithPod(loggedIn, recordingSync(events, {failSync: true}), app.store).execute())
                .rejects.toThrow("network down");
            await new SynchronizeWithPod(loggedIn, recordingSync(events), app.store).execute();

            expect(events).toEqual([`replace:${OLD_BASE}`, "sync", "sync"]);
        });

        it("refuses to sync a session of another WebID and erases nothing", async () => {
            const events: string[] = [];
            const app = fakeAppState({webId: ALICE, pendingPodReplacement: {webId: BOB, fromBase: OLD_BASE}});

            await expect(new SynchronizeWithPod(loggedIn, recordingSync(events), app.store).execute())
                .rejects.toBeInstanceOf(PendingSwitchMismatchError);

            expect(events).toEqual([]);
            expect(app.getPendingPodReplacement()).toEqual({webId: BOB, fromBase: OLD_BASE});
        });
    });
});
