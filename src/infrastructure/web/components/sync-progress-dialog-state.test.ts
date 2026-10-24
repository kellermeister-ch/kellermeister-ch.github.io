import {describe, it, expect, beforeEach, afterEach, vi} from "vitest";
import {CLOSE_DELAY_MS, SHOW_DELAY_MS, SyncDialogState, type SyncDialogView} from "./sync-progress-dialog-state.ts";
import type {SyncStatus} from "../../../application/sync/SyncCoordinator.ts";
import {initialSyncProgress, type SyncProgress} from "../../../application/ports/SyncService.ts";

const idle: SyncStatus = {state: "idle", lastSyncedAt: null, error: null, progress: null};
const syncing = (progress: SyncProgress = initialSyncProgress()): SyncStatus =>
    ({state: "syncing", lastSyncedAt: null, error: null, progress});
const failed: SyncStatus = {state: "error", lastSyncedAt: null, error: "network down", progress: null};

let dialog: SyncDialogState;
let views: SyncDialogView[];
const mode = () => dialog.getView().mode;

beforeEach(() => {
    vi.useFakeTimers();
    views = [];
    dialog = new SyncDialogState((view) => views.push(view));
    dialog.update(idle);
});

afterEach(() => {
    dialog.dispose();
    vi.useRealTimers();
});

describe("SyncDialogState", () => {
    it("never shows a run that ends within the delay", () => {
        dialog.update(syncing());
        vi.advanceTimersByTime(SHOW_DELAY_MS - 1);
        dialog.update(idle);
        vi.advanceTimersByTime(SHOW_DELAY_MS + CLOSE_DELAY_MS);
        expect(views.every((view) => view.mode === "hidden")).toBe(true);
    });

    it("shows a run that lasts longer than the delay, with its latest progress", () => {
        dialog.update(syncing());
        vi.advanceTimersByTime(SHOW_DELAY_MS);
        expect(mode()).toBe("running");

        const midway: SyncProgress = {...initialSyncProgress(), step: "pull", overall: 0.4};
        dialog.update(syncing(midway));
        expect(dialog.getView().progress).toEqual(midway);
    });

    it("shows a successful run as complete, then closes it by itself", () => {
        const progress: SyncProgress = {
            step: "push",
            overall: 0.95,
            containers: [{collection: "cellars", done: 5, total: 6}, {collection: "orders", done: 0, total: null}],
        };
        dialog.update(syncing(progress));
        vi.advanceTimersByTime(SHOW_DELAY_MS);
        dialog.update(idle);

        expect(mode()).toBe("done");
        expect(dialog.getView().progress).toEqual({
            step: "finish",
            overall: 1,
            containers: [{collection: "cellars", done: 6, total: 6}, {collection: "orders", done: 0, total: null}],
        });
        vi.advanceTimersByTime(CLOSE_DELAY_MS);
        expect(mode()).toBe("hidden");
    });

    it("keeps a failed run open with its error until closed", () => {
        dialog.update(syncing());
        vi.advanceTimersByTime(SHOW_DELAY_MS);
        dialog.update(failed);

        expect(mode()).toBe("failed");
        expect(dialog.getView().error).toBe("network down");
        vi.advanceTimersByTime(60_000);
        expect(mode()).toBe("failed");

        dialog.close();
        expect(mode()).toBe("hidden");
    });

    it("does not open for a run that fails within the delay", () => {
        dialog.update(syncing());
        dialog.update(failed);
        vi.advanceTimersByTime(SHOW_DELAY_MS);
        expect(mode()).toBe("hidden");
    });

    it("keeps a run sent to the background hidden, but shows the next run", () => {
        dialog.update(syncing());
        vi.advanceTimersByTime(SHOW_DELAY_MS);
        dialog.dismiss();
        expect(mode()).toBe("hidden");

        dialog.update(syncing({...initialSyncProgress(), overall: 0.5}));
        vi.advanceTimersByTime(SHOW_DELAY_MS);
        dialog.update(idle);
        expect(mode()).toBe("hidden"); // finished in the background: no "done" either

        dialog.update(syncing());
        vi.advanceTimersByTime(SHOW_DELAY_MS);
        expect(mode()).toBe("running");
    });

    it("starts a coalesced follow-up run fresh, dropping the previous run's completion", () => {
        dialog.update(syncing());
        vi.advanceTimersByTime(SHOW_DELAY_MS);
        dialog.update(idle); // run 1 done → "done", closing soon
        dialog.update(syncing()); // run 2 starts right away

        expect(mode()).toBe("hidden");
        vi.advanceTimersByTime(SHOW_DELAY_MS);
        expect(mode()).toBe("running");
        expect(dialog.getView().progress).toEqual(initialSyncProgress());
    });
});
