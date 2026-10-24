import {describe, it, expect} from "vitest";
import {SyncCoordinator} from "./SyncCoordinator.ts";
import {SynchronizeWithPod} from "./SynchronizeWithPod.ts";
import {NotAuthenticatedError} from "../errors.ts";
import type {AuthService, SolidSession} from "../ports/AuthService.ts";
import {fakeAppState} from "./appStateStore.fake.ts";
import {initialSyncProgress, type SyncProgress, type SyncProgressListener} from "../ports/SyncService.ts";

const session: SolidSession = {isLoggedIn: true, webId: "https://alice.pod/profile#me", fetch};
const loggedIn: AuthService = {isLoggedIn: () => true, getSession: () => session};
const loggedOut: AuthService = {isLoggedIn: () => false, getSession: () => ({isLoggedIn: false, webId: null, fetch})};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A SynchronizeWithPod whose runs complete only when we release them. */
function controllable() {
    const resolvers: Array<() => void> = [];
    // The progress callback handed to each run, to report progress through.
    const progressListeners: Array<SyncProgressListener | undefined> = [];
    let calls = 0;
    const synchronize = {
        execute: (onProgress?: SyncProgressListener) => {
            calls++;
            progressListeners.push(onProgress);
            return new Promise<{reconciled: number}>((resolve) => resolvers.push(() => resolve({reconciled: 0})));
        },
    } as unknown as SynchronizeWithPod;
    return {synchronize, resolvers, progressListeners, calls: () => calls};
}

describe("SyncCoordinator", () => {
    it("coalesces triggers fired during an in-flight run into a single follow-up run", async () => {
        const {synchronize, resolvers, calls} = controllable();
        const coordinator = new SyncCoordinator(loggedIn, synchronize);

        void coordinator.requestSync("manual"); // run 1 starts
        await flush();
        expect(calls()).toBe(1);

        void coordinator.requestSync("manual"); // coalesced
        void coordinator.requestSync("reconnect"); // coalesced into the SAME follow-up
        expect(calls()).toBe(1);

        resolvers[0](); // finish run 1 → exactly one follow-up run starts
        await flush();
        expect(calls()).toBe(2);

        resolvers[1](); // finish run 2 → no further runs
        await flush();
        expect(calls()).toBe(2);
    });

    it("skips the reconnect trigger silently when there is no session", async () => {
        const {synchronize, calls} = controllable();
        const coordinator = new SyncCoordinator(loggedOut, synchronize);
        await coordinator.requestSync("reconnect");
        expect(calls()).toBe(0);
        expect(coordinator.getStatus().state).toBe("idle");
    });

    it("throws NotAuthenticatedError on a manual trigger without a session", async () => {
        const {synchronize} = controllable();
        const coordinator = new SyncCoordinator(loggedOut, synchronize);
        await expect(coordinator.requestSync("manual")).rejects.toBeInstanceOf(NotAuthenticatedError);
    });

    it("reports error state when a run fails and leaves local data intact", async () => {
        const failing = {execute: () => Promise.reject(new Error("network down"))} as unknown as SynchronizeWithPod;
        const coordinator = new SyncCoordinator(loggedIn, failing);
        await coordinator.requestSync("manual");
        expect(coordinator.getStatus().state).toBe("error");
        expect(coordinator.getStatus().error).toContain("network down");
    });

    it("persists the last sync date on a successful run", async () => {
        const {synchronize, resolvers} = controllable();
        const app = fakeAppState();
        const coordinator = new SyncCoordinator(loggedIn, synchronize, app.store);

        void coordinator.requestSync("manual");
        await flush();
        resolvers[0]();
        await flush();

        expect(app.getLastSyncedAt()).toBeInstanceOf(Date);
        expect(app.getLastSyncedAt()?.getTime()).toBe(coordinator.getStatus().lastSyncedAt?.getTime());
    });

    it("seeds lastSyncedAt from the store at startup and notifies listeners", async () => {
        const seeded = new Date("2026-08-20T09:00:00.000Z");
        const {synchronize} = controllable();
        const coordinator = new SyncCoordinator(loggedIn, synchronize, fakeAppState({lastSyncedAt: seeded}).store);

        const seen: Array<Date | null> = [];
        coordinator.onStatusChange((s) => seen.push(s.lastSyncedAt));
        await flush();

        expect(coordinator.getStatus().lastSyncedAt?.getTime()).toBe(seeded.getTime());
        expect(seen[seen.length - 1]?.getTime()).toBe(seeded.getTime());
    });

    it("does not overwrite the persisted date when a run fails", async () => {
        const seeded = new Date("2026-08-20T09:00:00.000Z");
        const app = fakeAppState({lastSyncedAt: seeded});
        const failing = {execute: () => Promise.reject(new Error("network down"))} as unknown as SynchronizeWithPod;
        const coordinator = new SyncCoordinator(loggedIn, failing, app.store);

        await coordinator.requestSync("manual");
        await flush();

        expect(coordinator.getStatus().state).toBe("error");
        expect(app.getLastSyncedAt()?.getTime()).toBe(seeded.getTime());
    });

    it("reports progress to listeners while syncing and clears it when the run succeeds", async () => {
        const {synchronize, resolvers, progressListeners} = controllable();
        const coordinator = new SyncCoordinator(loggedIn, synchronize);
        const seen: Array<SyncProgress | null> = [];
        coordinator.onStatusChange((s) => seen.push(s.progress));

        void coordinator.requestSync("manual");
        await flush();
        expect(coordinator.getStatus().progress).toEqual(initialSyncProgress());

        const midway: SyncProgress = {...initialSyncProgress(), step: "pull", overall: 0.4};
        progressListeners[0]?.(midway);
        expect(coordinator.getStatus().state).toBe("syncing");
        expect(coordinator.getStatus().progress).toEqual(midway);
        expect(seen).toContainEqual(midway);

        resolvers[0]();
        await flush();
        expect(coordinator.getStatus().progress).toBeNull();
    });

    it("clears progress when the run fails", async () => {
        const failing = {execute: () => Promise.reject(new Error("network down"))} as unknown as SynchronizeWithPod;
        const coordinator = new SyncCoordinator(loggedIn, failing);
        await coordinator.requestSync("manual");
        expect(coordinator.getStatus().state).toBe("error");
        expect(coordinator.getStatus().progress).toBeNull();
    });

    it("starts a coalesced follow-up run from the initial progress", async () => {
        const {synchronize, resolvers, progressListeners} = controllable();
        const coordinator = new SyncCoordinator(loggedIn, synchronize);

        void coordinator.requestSync("manual");
        await flush();
        progressListeners[0]?.({...initialSyncProgress(), step: "push", overall: 0.95});
        void coordinator.requestSync("manual"); // coalesced

        resolvers[0]();
        await flush();
        expect(coordinator.getStatus().state).toBe("syncing");
        expect(coordinator.getStatus().progress).toEqual(initialSyncProgress());

        resolvers[1]();
        await flush();
    });
});
