import type {AuthService} from "../ports/AuthService.ts";
import type {SyncService, SyncOutcome, SyncProgressListener} from "../ports/SyncService.ts";
import type {ReadModelCache} from "../ports/ReadModelCache.ts";
import type {AppStateStore} from "../ports/AppStateStore.ts";
import {IdentityNotAdoptedError, NotAuthenticatedError, PendingSwitchMismatchError} from "../errors.ts";

/**
 * Use case: reconcile local state with the Pod. Requires an authenticated
 * session; the actual reconciliation is delegated to the SyncService port.
 *
 * A WebID switch that kept the local data leaves a pending Pod replacement
 * behind (see SwitchIdentity). It is completed here, BEFORE anything is synced:
 * the Pod's old Kellermeister data is erased and the local data prepared for
 * upload, and only then is the marker cleared. Until that point nothing has been
 * uploaded, so an interrupted replacement is simply run again by the next sync;
 * after it, an interrupted upload is an ordinary partial sync.
 *
 * Nothing is synced before the session's WebID has been adopted as this
 * device's identity: during a switch, the local data and the resolved Pod base
 * may still belong to the previous identity (or a replacement may be half
 * recorded), and a sync started on login can race the switch.
 *
 * A sync writes into the local store directly (re-homed URLs, records pulled
 * from the Pod), so any cached read model is stale afterwards and is dropped.
 */
export class SynchronizeWithPod {
    constructor(
        private readonly auth: AuthService,
        private readonly sync: SyncService,
        private readonly appState: AppStateStore,
        private readonly cache?: ReadModelCache,
    ) {
    }

    async execute(onProgress?: SyncProgressListener): Promise<SyncOutcome> {
        if (!this.auth.isLoggedIn()) {
            throw new NotAuthenticatedError();
        }
        const sessionWebId = this.auth.getSession().webId;
        const recordedWebId = await this.appState.getWebId();
        if (recordedWebId !== sessionWebId) {
            throw new IdentityNotAdoptedError(sessionWebId, recordedWebId);
        }
        const pending = await this.appState.getPendingPodReplacement();
        if (pending) {
            if (pending.webId !== sessionWebId) {
                throw new PendingSwitchMismatchError(sessionWebId, pending.webId);
            }
            try {
                await this.sync.replacePod(pending.fromBase);
            } finally {
                // The replacement may have moved local documents to new URLs
                // even if it then failed.
                this.cache?.invalidate();
            }
            await this.appState.setPendingPodReplacement(null);
        }
        const outcome = await this.sync.synchronize(onProgress);
        this.cache?.invalidate();
        return outcome;
    }
}
