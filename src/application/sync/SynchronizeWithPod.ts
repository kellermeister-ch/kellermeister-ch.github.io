import type {AuthService} from "../ports/AuthService.ts";
import type {SyncService, SyncOutcome, SyncProgressListener} from "../ports/SyncService.ts";
import type {ReadModelCache} from "../ports/ReadModelCache.ts";
import {NotAuthenticatedError} from "../errors.ts";

/**
 * Use case: reconcile local state with the Pod. Requires an authenticated
 * session; the actual reconciliation is delegated to the SyncService port.
 *
 * A sync writes into the local store directly (re-homed URLs, records pulled
 * from the Pod), so any cached read model is stale afterwards and is dropped.
 */
export class SynchronizeWithPod {
    constructor(
        private readonly auth: AuthService,
        private readonly sync: SyncService,
        private readonly cache?: ReadModelCache,
    ) {
    }

    async execute(onProgress?: SyncProgressListener): Promise<SyncOutcome> {
        if (!this.auth.isLoggedIn()) {
            throw new NotAuthenticatedError();
        }
        const outcome = await this.sync.synchronize(onProgress);
        this.cache?.invalidate();
        return outcome;
    }
}
