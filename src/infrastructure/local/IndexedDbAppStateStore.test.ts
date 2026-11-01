import "fake-indexeddb/auto";
import {describe, it, expect, beforeEach} from "vitest";
import {IndexedDbAppStateStore} from "./IndexedDbAppStateStore.ts";

function freshDb(): Promise<void> {
    return new Promise((resolve) => {
        const req = indexedDB.deleteDatabase("kellermeister-appstate");
        req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
}

describe("IndexedDbAppStateStore", () => {
    let store: IndexedDbAppStateStore;

    beforeEach(async () => {
        await freshDb();
        store = new IndexedDbAppStateStore();
    });

    it("returns null for unset values", async () => {
        expect(await store.getWebId()).toBeNull();
        expect(await store.getLastSyncedAt()).toBeNull();
        expect(await store.isSyncPending()).toBe(false);
    });

    it("round-trips the pending-sync flag (survives the login redirect)", async () => {
        await store.setSyncPending(true);
        expect(await new IndexedDbAppStateStore().isSyncPending()).toBe(true);

        await store.setSyncPending(false);
        expect(await new IndexedDbAppStateStore().isSyncPending()).toBe(false);
    });

    it("round-trips the WebID", async () => {
        await store.setWebId("https://alice.pod/profile#me");
        expect(await store.getWebId()).toBe("https://alice.pod/profile#me");
    });

    it("round-trips the last sync date (Date in -> Date out)", async () => {
        const when = new Date("2026-08-20T10:30:00.000Z");
        await store.setLastSyncedAt(when);
        const read = await store.getLastSyncedAt();
        expect(read).toBeInstanceOf(Date);
        expect(read?.getTime()).toBe(when.getTime());
    });

    it("persists across store instances (survives a reload)", async () => {
        await store.setWebId("https://bob.pod/profile#me");
        await store.setLastSyncedAt(new Date("2026-01-02T03:04:05.000Z"));

        const reopened = new IndexedDbAppStateStore();
        expect(await reopened.getWebId()).toBe("https://bob.pod/profile#me");
        expect((await reopened.getLastSyncedAt())?.toISOString()).toBe("2026-01-02T03:04:05.000Z");
    });

    it("clears the last sync date", async () => {
        await store.setLastSyncedAt(new Date("2026-01-02T03:04:05.000Z"));
        await store.setLastSyncedAt(null);
        expect(await new IndexedDbAppStateStore().getLastSyncedAt()).toBeNull();
    });

    it("round-trips the identity switch choice", async () => {
        expect(await store.getIdentitySwitchChoice()).toBeNull();

        await store.setIdentitySwitchChoice({webId: "https://bob.pod/profile#me", choice: "keep-local"});
        expect(await new IndexedDbAppStateStore().getIdentitySwitchChoice())
            .toEqual({webId: "https://bob.pod/profile#me", choice: "keep-local"});

        await store.setIdentitySwitchChoice(null);
        expect(await new IndexedDbAppStateStore().getIdentitySwitchChoice()).toBeNull();
    });

    it("reads a confirmation stored by an older version as keeping the Pod's data", async () => {
        await new Promise<void>((resolve, reject) => {
            const request = indexedDB.open("kellermeister-appstate", 1);
            request.onupgradeneeded = () => request.result.createObjectStore("appState");
            request.onsuccess = () => {
                const tx = request.result.transaction("appState", "readwrite");
                tx.objectStore("appState").put("https://bob.pod/profile#me", "confirmedIdentitySwitch");
                tx.oncomplete = () => { request.result.close(); resolve(); };
                tx.onerror = () => reject(tx.error);
            };
            request.onerror = () => reject(request.error);
        });

        expect(await store.getIdentitySwitchChoice()).toEqual({webId: "https://bob.pod/profile#me", choice: "keep-pod"});
    });

    it("round-trips the pending Pod replacement", async () => {
        expect(await store.getPendingPodReplacement()).toBeNull();

        await store.setPendingPodReplacement({webId: "https://bob.pod/profile#me", fromBase: "https://alice.pod/kellermeister/v1/"});
        expect(await new IndexedDbAppStateStore().getPendingPodReplacement())
            .toEqual({webId: "https://bob.pod/profile#me", fromBase: "https://alice.pod/kellermeister/v1/"});

        await store.setPendingPodReplacement({webId: "https://bob.pod/profile#me", fromBase: null});
        expect((await store.getPendingPodReplacement())?.fromBase).toBeNull();

        await store.setPendingPodReplacement(null);
        expect(await store.getPendingPodReplacement()).toBeNull();
    });
});
