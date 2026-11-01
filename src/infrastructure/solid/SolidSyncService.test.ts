/**
 * Unit tests for the re-home phase of the sync service (MigrateLocalUrls + the
 * cellarUrl string-reference fixup) and the Pod replacement of a WebID switch
 * (against an in-memory engine standing in for the Pod). The push/pull
 * `Sync.run` phase talks to a real Pod and is covered by the e2e suite, not here.
 */
import {describe, it, expect, beforeEach} from "vitest";
import type {InMemoryEngine, SolidEngine} from "soukai-bis";
import {turtleToQuads} from "@noeldemartin/solid-utils";

import {createMemoryEngine, installMemoryEngine} from "../../testing/soukai.ts";
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

    it("drops a provisional well-known cellar whose Pod copy is already stored locally", async () => {
        // Local data kept across a WebID switch: the synced well-known cellars are
        // stored under the Pod base, and the start without a resolved base
        // bootstrapped provisional duplicates of them.
        await new SoukaiCellar({url: `${POD}cellars/altglass#it`, name: "Altglass", displayOrder: 1}).save();
        await new SoukaiCellar({url: "local://cellars/altglass#it", name: "Altglass", displayOrder: 1}).save();
        await new SoukaiBottle({url: "local://bottles/b#it", cellarUrl: "local://cellars/altglass#it"}).save();

        await service.rehome(engine, POD);

        expect(await SoukaiCellar.all({from: "local://cellars/"})).toEqual([]);
        expect((await SoukaiCellar.all({from: `${POD}cellars/`})).map((c) => c.getId())).toEqual([`${POD}cellars/altglass#it`]);
        const [bottle] = await SoukaiBottle.all({from: `${POD}bottles/`});
        expect(bottle.cellarUrl).toBe(`${POD}cellars/altglass#it`);
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

describe("SolidSyncService.replacePod", () => {

    const OLD = "https://old.pod/private/kellermeister/v1/";
    const INBOX = "https://alice.pod/inbox/kellermeister/";
    let pod: InMemoryEngine;

    beforeEach(async () => {
        pod = createMemoryEngine();
        service = new SolidSyncService(
            auth,
            () => POD,
            () => pod as unknown as SolidEngine,
            async () => null,
            () => engine,
        );
        // The new Pod already holds Kellermeister data of its own, and an inbox order.
        for (const url of [`${POD}cellars/theirs`, `${POD}bottles/theirs`, `${POD}products/theirs`, `${POD}orders/theirs`, `${INBOX}order-1`]) {
            await pod.createDocument(url, await turtleToQuads(`<#it> a <https://schema.org/Thing> .`, {baseIRI: url}));
        }
    });

    /** Local data synced with the previous Pod (so it carries baselines). */
    async function seedSyncedLocalData(): Promise<void> {
        await new SoukaiCellar({url: `${OLD}cellars/keller#it`, name: "Keller", displayOrder: 1}).save();
        await new SoukaiProduct({url: `${OLD}products/p#it`, name: "Wein"}).save();
        await new SoukaiBottle({
            url: `${OLD}bottles/b#it`,
            productUrl: `${OLD}products/p#it`,
            cellarUrl: `${OLD}cellars/keller#it`,
        }).save();
        const bottle = await SoukaiBottle.find(`${OLD}bottles/b#it`) as SoukaiBottle;
        bottle.cellarUrl = `${OLD}cellars/altglass#it`; // history now holds both cellar literals
        await bottle.save();
        bottle.cellarUrl = `${OLD}cellars/keller#it`;
        await bottle.save();
        for (const url of Object.keys(await engine.getDocumentsLastModifiedAt())) {
            await engine.updateDocument(url, [], {lastModifiedAt: new Date("2026-10-01T00:00:00Z")});
        }
    }

    async function podDocumentUrls(): Promise<string[]> {
        const urls: string[] = [];
        for (const container of [`${POD}cellars/`, `${POD}bottles/`, `${POD}products/`, `${POD}orders/`, INBOX]) {
            const listing = await pod.readDocumentIfExists(container);
            urls.push(...(listing?.statements(undefined, "http://www.w3.org/ns/ldp#contains").map((quad) => quad.object.value) ?? []));
        }
        return urls.sort();
    }

    it("moves the local data to the new Pod's URLs, rewriting references", async () => {
        await seedSyncedLocalData();

        await service.replacePod(OLD);

        expect(await SoukaiCellar.all({from: `${OLD}cellars/`})).toEqual([]);
        expect(await SoukaiBottle.all({from: `${OLD}bottles/`})).toEqual([]);
        const [bottle] = await SoukaiBottle.all({from: `${POD}bottles/`});
        expect(bottle.getId()).toBe(`${POD}bottles/b#it`);
        expect(bottle.productUrl).toBe(`${POD}products/p#it`);
        expect(bottle.cellarUrl).toBe(`${POD}cellars/keller#it`);
        expect((await SoukaiCellar.all({from: `${POD}cellars/`})).map((c) => c.getName())).toEqual(["Keller"]);

        // Nothing — not even the operation history — refers to the previous Pod.
        for (const url of Object.keys(await engine.getDocumentsLastModifiedAt())) {
            const terms = (await engine.readDocument(url)).getQuads().flatMap((quad) => [quad.subject.value, quad.object.value]);
            expect(terms.filter((term) => term.startsWith(OLD)), url).toEqual([]);
        }
    });

    it("rewrites the cellar reference of a legacy bottle without CRDT metadata", async () => {
        // Bottles written by older app versions carry no crdt:Metadata.
        const url = `${OLD}bottles/legacy`;
        await engine.createDocument(url, await turtleToQuads(`
            <#it> a <https://schema.org/ListItem> ;
                <https://schema.org/cellar> "${OLD}cellars/keller#it" ;
                <https://schema.org/subjectOf> <${OLD}products/p#it> .
        `, {baseIRI: url}));

        await service.replacePod(OLD);

        const [bottle] = await SoukaiBottle.all({from: `${POD}bottles/`});
        expect(bottle.getId()).toBe(`${POD}bottles/legacy#it`);
        expect(bottle.productUrl).toBe(`${POD}products/p#it`);
        expect(bottle.cellarUrl).toBe(`${POD}cellars/keller#it`);
    });

    it("erases only the Kellermeister collections on the Pod", async () => {
        await service.replacePod(OLD);

        expect(await podDocumentUrls()).toEqual([`${INBOX}order-1`]);
    });

    it("leaves every local document without a baseline, so the next sync uploads it", async () => {
        await seedSyncedLocalData();

        await service.replacePod(OLD);

        const baselines = await engine.getDocumentsLastModifiedAt();
        const documents = Object.keys(baselines).filter((url) => !url.endsWith("/"));
        expect(documents.length).toBeGreaterThanOrEqual(3);
        expect(documents.every((url) => url.startsWith(POD))).toBe(true);
        expect(documents.filter((url) => baselines[url] !== null)).toEqual([]);
    });

    it("is idempotent", async () => {
        await seedSyncedLocalData();

        await service.replacePod(OLD);
        await service.replacePod(OLD);

        expect(await podDocumentUrls()).toEqual([`${INBOX}order-1`]);
        expect(await SoukaiBottle.all({from: `${POD}bottles/`})).toHaveLength(1);
        expect((await SoukaiBottle.all({from: `${POD}bottles/`}))[0].cellarUrl).toBe(`${POD}cellars/keller#it`);
    });

    it("leaves never-synced local data to the regular re-home", async () => {
        await new SoukaiCellar({url: "local://cellars/neu#it", name: "Neu", displayOrder: 1}).save();

        await service.replacePod(null);

        expect((await SoukaiCellar.all({from: "local://cellars/"})).map((c) => c.getName())).toEqual(["Neu"]);
        expect(await podDocumentUrls()).toEqual([`${INBOX}order-1`]);
    });
});
