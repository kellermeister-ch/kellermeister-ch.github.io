import type {AuthService} from "../ports/AuthService.ts";
import type {AppStateStore} from "../ports/AppStateStore.ts";
import {NotAuthenticatedError} from "../errors.ts";
import type {SynchronizeWithPod} from "./SynchronizeWithPod.ts";
import {initialSyncProgress, type SyncProgress} from "../ports/SyncService.ts";

export type SyncState = "idle" | "syncing" | "error";

export interface SyncStatus {
    state: SyncState;
    lastSyncedAt: Date | null;
    error: string | null;
    /** Progress of the running sync; `null` whenever no sync is running. */
    progress: SyncProgress | null;
}

export type SyncTrigger = "manual" | "reconnect";

type StatusListener = (status: SyncStatus) => void;

/**
 * Serializes synchronization into a single-flight process:
 *  - at most one sync runs at a time;
 *  - triggers fired during an in-flight run are coalesced into exactly one
 *    follow-up run;
 *  - the on-reconnect path is skipped silently without a valid session, while
 *    the manual path surfaces a NotAuthenticatedError so the UI can prompt login.
 */
export class SyncCoordinator {
    private status: SyncStatus = {state: "idle", lastSyncedAt: null, error: null, progress: null};
    private running = false;
    private pending = false;
    private readonly listeners = new Set<StatusListener>();

    constructor(
        private readonly auth: AuthService,
        private readonly synchronize: SynchronizeWithPod,
        private readonly appState?: AppStateStore,
    ) {
        // Seed the last-sync time from local storage so a reload shows the real
        // time before any new sync runs (best-effort; only fills an empty slot).
        void this.seedLastSynced();
    }

    private async seedLastSynced(): Promise<void> {
        if (!this.appState) {
            return;
        }
        const persisted = await this.appState.getLastSyncedAt();
        if (persisted && !this.status.lastSyncedAt) {
            this.setStatus({lastSyncedAt: persisted});
        }
    }

    getStatus(): SyncStatus {
        return this.status;
    }

    onStatusChange(listener: StatusListener): () => void {
        this.listeners.add(listener);
        listener(this.status);
        return () => this.listeners.delete(listener);
    }

    async requestSync(trigger: SyncTrigger): Promise<void> {
        if (!this.auth.isLoggedIn()) {
            if (trigger === "reconnect") {
                return; // skip silently — no session yet
            }
            throw new NotAuthenticatedError();
        }

        if (this.running) {
            this.pending = true; // coalesce into a single follow-up run
            return;
        }

        await this.run();
    }

    private async run(): Promise<void> {
        console.log("run: started...");
        const syncStart = Date.now();
        this.running = true;
        this.setStatus({state: "syncing", error: null, progress: initialSyncProgress()});
        console.log("run: step", initialSyncProgress().step);
        try {
            await this.synchronize.execute((progress) => {
                if (progress.step !== this.status.progress?.step) {
                    console.log("run: step", progress.step);
                }
                this.setStatus({progress});
            });
            const lastSyncedAt = new Date();
            console.log("run: finished in (seconds)", (Date.now() - syncStart)/1000);
            this.setStatus({state: "idle", lastSyncedAt, error: null, progress: null});
            await this.appState?.setLastSyncedAt(lastSyncedAt);
        } catch (error) {
            console.warn("run: failed", error);
            this.setStatus({state: "error", error: toMessage(error), progress: null});
        } finally {
            this.running = false;
            if (this.pending) {
                this.pending = false;
                await this.run();
            }
        }
    }

    private setStatus(patch: Partial<SyncStatus>): void {
        this.status = {...this.status, ...patch};
        for (const listener of this.listeners) {
            listener(this.status);
        }
    }
}

function toMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
