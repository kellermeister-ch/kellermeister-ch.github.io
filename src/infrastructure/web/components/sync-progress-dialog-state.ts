import type {SyncStatus} from "../../../application/sync/SyncCoordinator.ts";
import type {SyncProgress} from "../../../application/ports/SyncService.ts";

/** A run shorter than this never opens the dialog, so a quick no-op sync doesn't flash it. */
export const SHOW_DELAY_MS = 500;
/** How long the dialog shows a successful run as complete before closing by itself. */
export const CLOSE_DELAY_MS = 1500;

/**
 * `hidden`: not shown. `running`: shows the live progress. `done`: shows the
 * run as complete, closes after {@link CLOSE_DELAY_MS}. `failed`: shows the
 * error until the user closes it.
 */
export type SyncDialogMode = "hidden" | "running" | "done" | "failed";

export interface SyncDialogView {
    mode: SyncDialogMode;
    progress: SyncProgress | null;
    error: string | null;
}

/**
 * When the sync progress dialog is shown and closed, driven by the coordinator's
 * status changes. Each idle/error → syncing transition starts a new run; the
 * dialog opens only once a run has lasted {@link SHOW_DELAY_MS}, unless the user
 * sent that run to the background.
 */
export class SyncDialogState {
    private view: SyncDialogView = {mode: "hidden", progress: null, error: null};
    private syncing = false;
    private run = 0;
    private dismissedRun = -1;
    private showTimer: ReturnType<typeof setTimeout> | null = null;
    private closeTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(private readonly onChange: (view: SyncDialogView) => void) {
    }

    getView(): SyncDialogView {
        return this.view;
    }

    update(status: SyncStatus): void {
        if (status.state === "syncing") {
            if (!this.syncing) {
                this.startRun();
            }
            if (status.progress) {
                this.set({progress: status.progress});
            }
            return;
        }
        if (!this.syncing) {
            return;
        }
        this.syncing = false;
        this.clearShowTimer();
        if (this.view.mode !== "running") {
            return; // never opened (short run) or sent to the background
        }
        if (status.state === "error") {
            this.set({mode: "failed", error: status.error});
        } else {
            this.set({mode: "done", progress: completed(this.view.progress)});
            this.closeTimer = setTimeout(() => {
                this.closeTimer = null;
                this.set({mode: "hidden"});
            }, CLOSE_DELAY_MS);
        }
    }

    /** "Im Hintergrund": hide the dialog for the rest of this run. */
    dismiss(): void {
        this.dismissedRun = this.run;
        this.set({mode: "hidden"});
    }

    /** "Schliessen" after a failed run. */
    close(): void {
        this.set({mode: "hidden"});
    }

    dispose(): void {
        this.clearShowTimer();
        this.clearCloseTimer();
    }

    private startRun(): void {
        this.syncing = true;
        this.run++;
        this.clearCloseTimer();
        this.set({mode: "hidden", progress: null, error: null});
        const run = this.run;
        this.showTimer = setTimeout(() => {
            this.showTimer = null;
            if (this.syncing && this.run === run && this.dismissedRun !== run) {
                this.set({mode: "running"});
            }
        }, SHOW_DELAY_MS);
    }

    private clearShowTimer(): void {
        if (this.showTimer) {
            clearTimeout(this.showTimer);
            this.showTimer = null;
        }
    }

    private clearCloseTimer(): void {
        if (this.closeTimer) {
            clearTimeout(this.closeTimer);
            this.closeTimer = null;
        }
    }

    private set(patch: Partial<SyncDialogView>): void {
        this.view = {...this.view, ...patch};
        this.onChange(this.view);
    }
}

/** The last progress of a successful run, shown as complete: 100 %, every listed container fully processed. */
function completed(progress: SyncProgress | null): SyncProgress | null {
    if (!progress) {
        return null;
    }
    return {
        step: "finish",
        overall: 1,
        containers: progress.containers.map((container) =>
            container.total === null ? container : {...container, done: container.total}),
    };
}
