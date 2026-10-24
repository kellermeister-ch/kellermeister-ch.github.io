import {describe, it, expect} from "vitest";
import {toSyncProgress} from "./syncProgressFromJob.ts";
import {SYNC_COLLECTIONS} from "../../application/ports/SyncService.ts";

const doc = (completed: boolean) => ({completed});

/** A soukai-bis Sync status tree: `{root, children: [pull, push]}`. */
const tree = (containers: object[], pullCompleted = false) => ({
    root: true,
    completed: false,
    children: [{completed: pullCompleted, children: containers}, {completed: false}],
});

describe("toSyncProgress", () => {
    it("reports containers whose listing has not been read without a total", () => {
        const progress = toSyncProgress(tree([{completed: false}, {completed: false}, {completed: false}, {completed: false}]), 0, SYNC_COLLECTIONS);
        expect(progress.step).toBe("pull");
        expect(progress.containers).toEqual(SYNC_COLLECTIONS.map((collection) => ({collection, done: 0, total: null})));
    });

    it("reports every container as not listed before the pull has registered them", () => {
        const status = {root: true, completed: false, children: [{completed: false}, {completed: false}]};
        expect(toSyncProgress(status, 0, SYNC_COLLECTIONS).containers)
            .toEqual(SYNC_COLLECTIONS.map((collection) => ({collection, done: 0, total: null})));
    });

    it("counts processed documents per container, in type-index order", () => {
        const progress = toSyncProgress(tree([
            {completed: false, children: [doc(true), doc(true)]},
            {completed: false, children: [doc(true), doc(false), doc(false)]},
            {completed: false, children: [doc(false)]},
            {completed: false},
        ]), 0.3, SYNC_COLLECTIONS);
        expect(progress.containers).toEqual([
            {collection: "cellars", done: 2, total: 2},
            {collection: "products", done: 1, total: 3},
            {collection: "bottles", done: 0, total: 1},
            {collection: "orders", done: 0, total: null},
        ]);
        expect(progress.overall).toBe(0.3);
    });

    it("reports a completed empty container as 0/0", () => {
        const progress = toSyncProgress(tree([{completed: true}, {completed: false}, {completed: false}, {completed: false}]), 0.2, SYNC_COLLECTIONS);
        expect(progress.containers[0]).toEqual({collection: "cellars", done: 0, total: 0});
    });

    it("switches to the push step once pull is complete", () => {
        const done = {completed: true, children: [doc(true)]};
        const progress = toSyncProgress(tree([done, done, done, done], true), 0.9, SYNC_COLLECTIONS);
        expect(progress.step).toBe("push");
    });

    it("never lets the overall share decrease", () => {
        const progress = toSyncProgress(tree([{}, {}, {}, {}]), 0.4, SYNC_COLLECTIONS, 0.6);
        expect(progress.overall).toBe(0.6);
    });

    it("falls back to the overall share alone on an unexpected tree shape", () => {
        for (const status of [undefined, {}, {children: []}, tree([{}, {}])]) {
            expect(toSyncProgress(status, 0.5, SYNC_COLLECTIONS)).toEqual({step: "pull", overall: 0.5, containers: []});
        }
    });
});
