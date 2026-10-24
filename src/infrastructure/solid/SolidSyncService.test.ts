/**
 * Unit tests for the re-home phase of the sync service (MigrateLocalUrls + the
 * cellarUrl string-reference fixup). The push/pull `Sync.run` phase talks to a
 * real Pod and is covered by the e2e suite, not here.
 */
import {describe, it, expect, beforeEach} from "vitest";
import type {InMemoryEngine} from "soukai-bis";

import {installMemoryEngine} from "../../testing/soukai.ts";
import {APPLICATION_MODELS, SolidSyncService} from "./SolidSyncService.ts";
import {SYNC_COLLECTIONS} from "../../application/ports/SyncService.ts";
import type {AuthService} from "../../application/ports/AuthService.ts";
import {SoukaiCellar} from "../soukai/model/SoukaiCellar.ts";
import {SoukaiProduct} from "../soukai/model/SoukaiProduct.ts";
import {SoukaiBottle} from "../soukai/model/SoukaiBottle.ts";

const POD = "https://alice.pod/private/kellermeister/v1/";

const auth: AuthService = {
    isLoggedIn: () => true,
    getSession: () => ({isLoggedIn: true, webId: "https://alice.pod/profile#me", fetch}),
};

let engine: InMemoryEngine;
let service: SolidSyncService;

beforeEach(() => {
    engine = installMemoryEngine();
    service = new SolidSyncService(auth, () => POD);
});

describe("SolidSyncService.rehome", () => {

    it("migrates provisional local:// resources to their Pod URLs, rewriting references", async () => {
        await new SoukaiCellar({url: "local://cellars/keller#it", name: "Keller", displayOrder: 1}).save();
        await new SoukaiProduct({
            url: "local://products/p#it",
            name: "Wein",
            orderItemUrl: "local://orders/o#item", // IRI back-link (rewritten by MigrateLocalUrls)
        }).save();
        await new SoukaiBottle({
            url: "local://bottles/b#it",
            productUrl: "local://products/p#it",   // IRI reference (rewritten by MigrateLocalUrls)
            cellarUrl: "local://cellars/keller#it", // string literal (fixed up separately)
        }).save();

        await service.rehome(engine, POD);

        // Nothing provisional remains.
        expect(await SoukaiCellar.all({from: "local://cellars/"})).toEqual([]);
        expect(await SoukaiBottle.all({from: "local://bottles/"})).toEqual([]);

        // Everything re-homed to the Pod base.
        const cellars = await SoukaiCellar.all({from: `${POD}cellars/`});
        expect(cellars.map((c) => c.getId())).toEqual([`${POD}cellars/keller#it`]);

        const bottles = await SoukaiBottle.all({from: `${POD}bottles/`});
        expect(bottles).toHaveLength(1);
        // IRI reference rewritten by MigrateLocalUrls.
        expect(bottles[0].productUrl).toBe(`${POD}products/p#it`);
        // String-literal reference rewritten by the fixup.
        expect(bottles[0].cellarUrl).toBe(`${POD}cellars/keller#it`);

        // The product → order-item back-link is re-homed the same way, so the
        // seller stays resolvable after sync.
        const products = await SoukaiProduct.all({from: `${POD}products/`});
        expect(products).toHaveLength(1);
        expect(products[0].orderItemUrl).toBe(`${POD}orders/o#item`);
    });

    it("is idempotent and a no-op when there is nothing provisional", async () => {
        await new SoukaiCellar({url: `${POD}cellars/keller#it`, name: "Keller", displayOrder: 1}).save();

        const fixed = await service.rehome(engine, POD);

        expect(fixed).toBe(0);
        expect(await SoukaiCellar.all({from: `${POD}cellars/`})).toHaveLength(1);
    });
});

describe("SolidSyncService container order", () => {

    // The sync progress rows map soukai-bis's per-container status by position,
    // so the type index must register the containers in SYNC_COLLECTIONS order.
    it("registers the synced collections in SYNC_COLLECTIONS order", () => {
        expect(APPLICATION_MODELS.map(({collection}) => collection)).toEqual(SYNC_COLLECTIONS);
    });

    it("builds the type index with its containers in that order", () => {
        const typeIndex = service["buildTypeIndex"](POD);
        expect((typeIndex.registrations ?? []).map((registration) => registration.instanceContainer))
            .toEqual(SYNC_COLLECTIONS.map((collection) => `${POD}${collection}/`));
    });
});
