import {describe, it, expect} from "vitest";
import {PendingSync} from "./PendingSync.ts";
import {ReconnectSync} from "./ReconnectSync.ts";
import {fakeAppState} from "./appStateStore.fake.ts";
import type {AuthService, SolidSession} from "../ports/AuthService.ts";

const ALICE = "https://alice.pod/profile#me";
const session: SolidSession = {isLoggedIn: true, webId: ALICE, fetch};
const loggedIn: AuthService = {isLoggedIn: () => true, getSession: () => session};
const loggedOut: AuthService = {isLoggedIn: () => false, getSession: () => ({isLoggedIn: false, webId: null, fetch})};

const podResolved = () => true;
const podUnresolved = () => false;

/** A ReconnectSync stand-in that just counts its runs. */
function countingReconnect(): {reconnect: ReconnectSync; runs: () => number} {
    let runs = 0;
    const reconnect = {run: async () => { runs++; }} as unknown as ReconnectSync;
    return {reconnect, runs: () => runs};
}

describe("PendingSync", () => {

    it("does not sync on a plain reload (nothing was remembered)", async () => {
        const app = fakeAppState();
        const {reconnect, runs} = countingReconnect();

        await new PendingSync(loggedIn, app.store, reconnect, podResolved).run();

        expect(runs()).toBe(0);
    });

    it("syncs once after the login redirect returns, then forgets the request", async () => {
        const app = fakeAppState({webId: ALICE});
        const {reconnect, runs} = countingReconnect();
        const pending = new PendingSync(loggedIn, app.store, reconnect, podResolved);

        await pending.remember(); // pressing Sync while logged out
        expect(app.isSyncPending()).toBe(true);

        await pending.run(); // back from the login redirect
        expect(runs()).toBe(1);
        expect(app.isSyncPending()).toBe(false);

        await pending.run(); // a later reload must not sync again
        expect(runs()).toBe(1);
    });

    it("keeps the request when the login was never completed", async () => {
        const app = fakeAppState({syncPending: true});
        const {reconnect, runs} = countingReconnect();

        await new PendingSync(loggedOut, app.store, reconnect, podResolved).run();

        expect(runs()).toBe(0);
        expect(app.isSyncPending()).toBe(true);
    });

    it("keeps the request until the Pod container is resolved", async () => {
        const app = fakeAppState({webId: ALICE, syncPending: true});
        const {reconnect, runs} = countingReconnect();

        // Startup: logged in, but the container base is not known yet.
        await new PendingSync(loggedIn, app.store, reconnect, podUnresolved).run();
        expect(runs()).toBe(0);
        expect(app.isSyncPending()).toBe(true);

        // Container resolved → the remembered sync runs, exactly once.
        await new PendingSync(loggedIn, app.store, reconnect, podResolved).run();
        expect(runs()).toBe(1);
        expect(app.isSyncPending()).toBe(false);
    });

    it("keeps the request until the session's WebID is adopted (a switch is still being settled)", async () => {
        const app = fakeAppState({webId: "https://bob.pod/profile#me", syncPending: true});
        const {reconnect, runs} = countingReconnect();
        const pending = new PendingSync(loggedIn, app.store, reconnect, podResolved);

        await pending.run();
        expect(runs()).toBe(0);
        expect(app.isSyncPending()).toBe(true);

        await app.store.setWebId(ALICE); // the switch records the new identity
        await pending.run();
        expect(runs()).toBe(1);
    });

    it("forgets the request even when the sync itself fails", async () => {
        const app = fakeAppState({webId: ALICE, syncPending: true});
        const failing = {run: async () => { throw new Error("boom"); }} as unknown as ReconnectSync;

        await expect(new PendingSync(loggedIn, app.store, failing, podResolved).run()).rejects.toThrow("boom");

        expect(app.isSyncPending()).toBe(false);
    });
});
