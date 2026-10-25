import {describe, it, expect, beforeEach} from "vitest";
import type {InMemoryEngine} from "soukai-bis";

import {createMemoryEngine} from "../../testing/soukai.ts";
import {alignChangedBaselines, type Baselines} from "./syncBaselines.ts";

const BOTTLES = "https://alice.pod/private/kellermeister/v1/bottles/";
const CELLARS = "https://alice.pod/private/kellermeister/v1/cellars/";

const podModified = new Date("2026-10-01T10:00:00.000Z");
const syncStartedAt = new Date("2026-10-25T08:00:00.000Z");
const estimate = new Date("2026-10-25T08:00:03.000Z"); // what a no-op merge stores

let local: InMemoryEngine;
let listings: Record<string, Map<string, Date>>;
let reads: string[];
const readListing = async (containerUrl: string) => {
    reads.push(containerUrl);
    return listings[containerUrl] ?? new Map();
};
const baselineOf = async (url: string) => (await local.getDocumentsLastModifiedAt())[url];

beforeEach(() => {
    local = createMemoryEngine();
    listings = {};
    reads = [];
});

describe("alignChangedBaselines", () => {
    it("replaces a merge estimate with the Pod's dc:modified, so the next sync skips the document", async () => {
        const url = `${BOTTLES}b1`;
        await local.createDocument(url, [], {lastModifiedAt: new Date("2026-10-24T20:00:00.000Z")});
        const before: Baselines = await local.getDocumentsLastModifiedAt();
        await local.updateDocument(url, [], {lastModifiedAt: estimate});
        listings[BOTTLES] = new Map([[url, podModified]]);

        expect(await alignChangedBaselines(local, before, syncStartedAt, readListing)).toBe(1);
        expect(await baselineOf(url)).toEqual(podModified);
    });

    it("reads no listing when the sync changed no baseline", async () => {
        await local.createDocument(`${BOTTLES}b1`, [], {lastModifiedAt: podModified});
        const before = await local.getDocumentsLastModifiedAt();

        expect(await alignChangedBaselines(local, before, syncStartedAt, readListing)).toBe(0);
        expect(reads).toEqual([]);
    });

    it("reads only the containers with changed baselines, once each", async () => {
        const before = await local.getDocumentsLastModifiedAt();
        await local.createDocument(`${BOTTLES}b1`, [], {lastModifiedAt: estimate});
        await local.createDocument(`${BOTTLES}b2`, [], {lastModifiedAt: estimate});
        listings[BOTTLES] = new Map([[`${BOTTLES}b1`, podModified], [`${BOTTLES}b2`, podModified]]);

        expect(await alignChangedBaselines(local, before, syncStartedAt, readListing)).toBe(2);
        expect(reads).toEqual([BOTTLES]);
    });

    it("leaves an unsynced document unsynced, so its local edits are still pushed", async () => {
        const url = `${CELLARS}c1`;
        const before = await local.getDocumentsLastModifiedAt();
        await local.createDocument(url, []); // baseline null: never synced
        await local.createDocument(`${CELLARS}c2`, [], {lastModifiedAt: estimate});
        listings[CELLARS] = new Map([[url, podModified], [`${CELLARS}c2`, podModified]]);

        await alignChangedBaselines(local, before, syncStartedAt, readListing);
        expect(await baselineOf(url)).toBeNull();
    });

    it("leaves a document edited while the listing is read unsynced", async () => {
        const url = `${BOTTLES}b1`;
        const before = await local.getDocumentsLastModifiedAt();
        await local.createDocument(url, [], {lastModifiedAt: estimate});
        const editDuringRead = async () => {
            await local.deleteDocument(url);
            await local.createDocument(url, []); // a local edit: baseline null again
            return new Map([[url, podModified]]);
        };

        expect(await alignChangedBaselines(local, before, syncStartedAt, editDuringRead)).toBe(0);
        expect(await baselineOf(url)).toBeNull();
    });

    it("keeps the baseline when the Pod version is newer than the sync start, so that change is still pulled", async () => {
        const url = `${BOTTLES}b1`;
        const before = await local.getDocumentsLastModifiedAt();
        await local.createDocument(url, [], {lastModifiedAt: estimate});
        listings[BOTTLES] = new Map([[url, new Date("2026-10-25T08:00:05.000Z")]]);

        expect(await alignChangedBaselines(local, before, syncStartedAt, readListing)).toBe(0);
        expect(await baselineOf(url)).toEqual(estimate);
    });

    it("leaves a correctly pulled document alone", async () => {
        const url = `${BOTTLES}b1`;
        const before = await local.getDocumentsLastModifiedAt();
        await local.createDocument(url, [], {lastModifiedAt: podModified});
        listings[BOTTLES] = new Map([[url, podModified]]);

        expect(await alignChangedBaselines(local, before, syncStartedAt, readListing)).toBe(0);
    });
});
