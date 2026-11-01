/**
 * Acceptance test for the WebID switch, driving the REAL repositories and the
 * real wipe adapter against fake-indexeddb: data created under one identity must
 * not be readable under another, and the store must be usable afterwards.
 */
import {describe, it, expect, beforeEach, afterEach} from "vitest";
import {getEngine, IndexedDBEngine} from "soukai-bis";

import {installIndexedDbEngine} from "../testing/soukai.ts";
import {SoukaiBottle} from "./soukai/model/SoukaiBottle.ts";
import {SoukaiProduct} from "./soukai/model/SoukaiProduct.ts";
import {SoukaiCellarRepository} from "./soukai/SoukaiCellarRepository.ts";
import {SoukaiProductRepository} from "./soukai/SoukaiProductRepository.ts";
import {SoukaiBottleRepository} from "./soukai/SoukaiBottleRepository.ts";
import {IndexedDbLocalDataStore} from "./local/IndexedDbLocalDataStore.ts";
import {APP_STATE_DB_NAME, IndexedDbAppStateStore} from "./local/IndexedDbAppStateStore.ts";
import {PodContainerRegistry} from "./solid/PodContainerRegistry.ts";
import {SwitchIdentity} from "../application/identity/SwitchIdentity.ts";

const ALICE = "https://alice.pod/profile#me";
const BOB = "https://bob.pod/profile#me";
const WEBID_HISTORY_KEY = "kellermeister_webid_history";

function stubLocalStorage(): void {
    const store = new Map<string, string>([[WEBID_HISTORY_KEY, JSON.stringify([ALICE])]]);
    Object.defineProperty(globalThis, "localStorage", {
        value: {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => { store.set(k, v); },
            removeItem: (k: string) => { store.delete(k); },
        } as unknown as Storage,
        configurable: true,
    });
}

let dbCounter = 0;
let registry: PodContainerRegistry;
let appState: IndexedDbAppStateStore;
let identity: SwitchIdentity;

/** The app-state database has a fixed name, so it outlives a test unless dropped. */
function freshAppStateDb(): Promise<void> {
    return new Promise((resolve) => {
        const request = indexedDB.deleteDatabase(APP_STATE_DB_NAME);
        request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
}

beforeEach(async () => {
    stubLocalStorage();
    await freshAppStateDb();
    installIndexedDbEngine(`switch-${dbCounter++}`);
    registry = new PodContainerRegistry();
    appState = new IndexedDbAppStateStore();
    identity = new SwitchIdentity(appState, new IndexedDbLocalDataStore(registry));
});

afterEach(async () => {
    const engine = getEngine();
    if (engine instanceof IndexedDBEngine) {
        await engine.close();
    }
});

describe("WebID switch", () => {

    it("removes the previous identity's cellars and bottles, and rebuilds the well-known cellars", async () => {
        // --- Alice's device: log in, create data ---
        await identity.switchTo(ALICE);
        const products = new SoukaiProductRepository(() => null);
        const cellars = new SoukaiCellarRepository(() => null);
        const bottles = new SoukaiBottleRepository(() => null, products);

        const wein = await products.save(new SoukaiProduct({name: "Rioja"}));
        await bottles.save(new SoukaiBottle({productUrl: (wein as SoukaiProduct).url, cellarUrl: "local://cellars/c1#it"}));
        await cellars.createCellar("Alices Keller");

        expect((await cellars.fetchCellars()).map((c) => c.getName())).toContain("Alices Keller");
        expect(await bottles.fetchBottles()).toHaveLength(1);

        // --- Bob logs in on the same device ---
        expect(await identity.check(BOB)).toEqual({kind: "choice-required", previousWebId: ALICE});
        expect(await identity.switchTo(BOB, "keep-pod")).toBe(true);

        // --- Nothing of Alice's is readable, and the store still works ---
        const bobCellars = new SoukaiCellarRepository(() => null);
        const bobProducts = new SoukaiProductRepository(() => null);
        const bobBottles = new SoukaiBottleRepository(() => null, bobProducts);

        const names = (await bobCellars.fetchCellars()).map((c) => c.getName());
        expect(names).not.toContain("Alices Keller");
        expect(await bobBottles.fetchBottles()).toEqual([]);
        expect(await bobProducts.fetchAll()).toEqual([]);
        // The well-known cellars are recreated by the fresh bootstrap.
        expect(names.sort()).toEqual(["Altglass", "Eingang"]);

        // The identity is now Bob's, and the session metadata is Alice-free.
        expect(await appState.getWebId()).toBe(BOB);
        expect(await appState.getLastSyncedAt()).toBeNull();
        expect(registry.get()).toBeNull();
        expect(localStorage.getItem(WEBID_HISTORY_KEY)).toBe(JSON.stringify([ALICE]));
    });

    it("hands the local data to the new identity when keeping it", async () => {
        await identity.switchTo(ALICE);
        registry.set("https://alice.pod/private/kellermeister/v1/");
        await appState.setLastSyncedAt(new Date("2026-10-01T00:00:00Z"));
        const cellars = new SoukaiCellarRepository(() => null);
        await cellars.createCellar("Alices Keller");

        expect(await identity.switchTo(BOB, "keep-local")).toBe(true);

        // The data stays, detached from Alice's Pod, and Bob owns it.
        expect((await new SoukaiCellarRepository(() => null).fetchCellars()).map((c) => c.getName())).toContain("Alices Keller");
        expect(registry.get()).toBeNull();
        expect(new PodContainerRegistry().get()).toBeNull(); // also forgotten in localStorage
        expect(await appState.getWebId()).toBe(BOB);
        expect(await appState.getLastSyncedAt()).toBeNull();
        expect(await appState.isSyncPending()).toBe(true);
        expect(await appState.getPendingPodReplacement())
            .toEqual({webId: BOB, fromBase: "https://alice.pod/private/kellermeister/v1/"});
    });

    it("keeps data created before the first login", async () => {
        // Local-first: data may exist before any WebID is recorded.
        const cellars = new SoukaiCellarRepository(() => null);
        await cellars.createCellar("Vor dem Login");

        expect(await identity.check(ALICE)).toEqual({kind: "proceed"});
        expect(await identity.switchTo(ALICE)).toBe(false);

        const names = (await new SoukaiCellarRepository(() => null).fetchCellars()).map((c) => c.getName());
        expect(names).toContain("Vor dem Login");
    });

    it("keeps the data when the same WebID logs in again", async () => {
        await identity.switchTo(ALICE);
        const cellars = new SoukaiCellarRepository(() => null);
        await cellars.createCellar("Alices Keller");

        expect(await identity.switchTo(ALICE)).toBe(false);

        const names = (await new SoukaiCellarRepository(() => null).fetchCellars()).map((c) => c.getName());
        expect(names).toContain("Alices Keller");
    });
});
