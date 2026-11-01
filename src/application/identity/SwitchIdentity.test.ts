import {describe, it, expect} from "vitest";
import {SwitchIdentity} from "./SwitchIdentity.ts";
import {fakeAppState} from "../sync/appStateStore.fake.ts";
import type {LocalDataStore} from "../ports/LocalDataStore.ts";

const A = "https://alice.pod/profile#me";
const B = "https://bob.pod/profile#me";

const BASE_A = "https://alice.pod/private/kellermeister/v1/";

/** A LocalDataStore that records when it was wiped / detached, relative to the marker write. */
function recordingStore(events: string[], onWipe?: () => void, podBase: string | null = BASE_A): LocalDataStore {
    let base = podBase;
    return {
        wipe: async () => {
            events.push("wipe");
            onWipe?.();
        },
        getPodBase: () => base,
        detachFromPod: () => {
            events.push("detach");
            base = null;
        },
    };
}

describe("SwitchIdentity", () => {

    describe("check", () => {
        it("reports a switch when the WebID differs from the recorded one", async () => {
            const app = fakeAppState({webId: A});
            const check = await new SwitchIdentity(app.store, recordingStore([])).check(B);
            expect(check).toEqual({kind: "choice-required", previousWebId: A});
        });

        it("proceeds for the same WebID", async () => {
            const app = fakeAppState({webId: A});
            expect(await new SwitchIdentity(app.store, recordingStore([])).check(A)).toEqual({kind: "proceed"});
        });

        it("proceeds on first use, so pre-login data survives", async () => {
            const app = fakeAppState(); // nothing recorded yet
            expect(await new SwitchIdentity(app.store, recordingStore([])).check(A)).toEqual({kind: "proceed"});
        });
    });

    describe("switchTo keeping the Pod's data", () => {
        it("wipes the previous identity's data and records the new WebID", async () => {
            const events: string[] = [];
            const app = fakeAppState({webId: A});

            expect(await new SwitchIdentity(app.store, recordingStore(events)).switchTo(B, "keep-pod")).toBe(true);

            expect(events).toEqual(["wipe"]);
            expect(app.getWebId()).toBe(B);
        });

        it("records the new WebID only AFTER the wipe", async () => {
            // The wipe deletes the store holding the marker, so recording first
            // would erase it again.
            const events: string[] = [];
            const app = fakeAppState({webId: A});
            const store = recordingStore(events, () => events.push(`marker:${app.getWebId()}`));

            await new SwitchIdentity(app.store, store).switchTo(B, "keep-pod");

            // At wipe time the marker was still the OLD one — it had not been written yet.
            expect(events).toEqual(["wipe", `marker:${A}`]);
            expect(app.getWebId()).toBe(B);
        });

        it("does not wipe for the same WebID", async () => {
            const events: string[] = [];
            const app = fakeAppState({webId: A});

            expect(await new SwitchIdentity(app.store, recordingStore(events)).switchTo(A)).toBe(false);

            expect(events).toEqual([]);
            expect(app.getWebId()).toBe(A);
        });

        it("does not wipe on first use but records the identity", async () => {
            const events: string[] = [];
            const app = fakeAppState();

            expect(await new SwitchIdentity(app.store, recordingStore(events)).switchTo(A)).toBe(false);

            expect(events).toEqual([]);
            expect(app.getWebId()).toBe(A);
        });

        it("is idempotent: re-running the same switch wipes only once", async () => {
            const events: string[] = [];
            const app = fakeAppState({webId: A});
            const identity = new SwitchIdentity(app.store, recordingStore(events));

            await identity.switchTo(B, "keep-pod");
            await identity.switchTo(B, "keep-pod"); // e.g. the callback fires twice

            expect(events).toEqual(["wipe"]);
            expect(app.getWebId()).toBe(B);
        });

        it("counts as first use when recording the marker fails after the wipe", async () => {
            // Interrupted switch: the data is already gone, so the next login must
            // NOT treat the previous identity as the owner of the local store.
            const app = fakeAppState({webId: A});
            const store = {
                ...app.store,
                setWebId: async () => { throw new Error("db closed"); },
            };

            await expect(new SwitchIdentity(store, recordingStore([])).switchTo(B, "keep-pod")).rejects.toThrow("db closed");

            // No marker survives the failure, so the next check reports first use.
            const afterCrash = fakeAppState(); // the app-state database was deleted
            expect(await new SwitchIdentity(afterCrash.store, recordingStore([])).check(B)).toEqual({kind: "proceed"});
        });

        it("leaves no marker when the wipe fails, so the switch can be retried", async () => {
            const app = fakeAppState({webId: A});
            const failing: LocalDataStore = {...recordingStore([]), wipe: async () => { throw new Error("purge blocked"); }};

            await expect(new SwitchIdentity(app.store, failing).switchTo(B, "keep-pod")).rejects.toThrow("purge blocked");

            // Still the previous identity: the switch did not silently half-happen.
            expect(app.getWebId()).toBe(A);
        });
    });

    describe("switchTo keeping the local data", () => {
        it("keeps the local data and records the pending Pod replacement with the previous base", async () => {
            const events: string[] = [];
            const app = fakeAppState({webId: A, lastSyncedAt: new Date("2026-10-01T00:00:00Z")});

            expect(await new SwitchIdentity(app.store, recordingStore(events)).switchTo(B, "keep-local")).toBe(true);

            expect(events).toEqual(["detach"]);
            expect(app.getPendingPodReplacement()).toEqual({webId: B, fromBase: BASE_A});
            expect(app.getLastSyncedAt()).toBeNull();
            expect(app.isSyncPending()).toBe(true);
            expect(app.getWebId()).toBe(B);
        });

        it("records the pending replacement BEFORE detaching and the WebID last", async () => {
            const events: string[] = [];
            const app = fakeAppState({webId: A});
            const store = {
                ...app.store,
                setPendingPodReplacement: async (pending: Parameters<typeof app.store.setPendingPodReplacement>[0]) => {
                    events.push("pending");
                    await app.store.setPendingPodReplacement(pending);
                },
                setWebId: async (webId: string) => {
                    events.push("webId");
                    await app.store.setWebId(webId);
                },
            };

            await new SwitchIdentity(store, recordingStore(events)).switchTo(B, "keep-local");

            expect(events).toEqual(["pending", "detach", "webId"]);
        });

        it("keeps the first base when an interrupted switch is repeated", async () => {
            // The first attempt detached (base forgotten) but died before recording B.
            const app = fakeAppState({webId: A, pendingPodReplacement: {webId: B, fromBase: BASE_A}});

            await new SwitchIdentity(app.store, recordingStore([], undefined, null)).switchTo(B, "keep-local");

            expect(app.getPendingPodReplacement()).toEqual({webId: B, fromBase: BASE_A});
            expect(app.getWebId()).toBe(B);
        });

        it("records no base when the local data was never synced", async () => {
            const app = fakeAppState({webId: A});

            await new SwitchIdentity(app.store, recordingStore([], undefined, null)).switchTo(B, "keep-local");

            expect(app.getPendingPodReplacement()).toEqual({webId: B, fromBase: null});
        });

        it("drops an interrupted switch's replacement when the recorded identity logs in again", async () => {
            const app = fakeAppState({webId: A, pendingPodReplacement: {webId: B, fromBase: BASE_A}});

            expect(await new SwitchIdentity(app.store, recordingStore([])).switchTo(A)).toBe(false);

            expect(app.getPendingPodReplacement()).toBeNull();
        });

        it("requires a choice for a switch", async () => {
            const app = fakeAppState({webId: A});

            await expect(new SwitchIdentity(app.store, recordingStore([])).switchTo(B)).rejects.toThrow(/requires a choice/);
            expect(app.getWebId()).toBe(A);
        });
    });
});
