import type {AppStateStore, IdentitySwitchDecision, PendingPodReplacement} from "../ports/AppStateStore.ts";

export interface AppStateStoreSeed {
    webId?: string | null;
    lastSyncedAt?: Date | null;
    syncPending?: boolean;
    identitySwitchChoice?: IdentitySwitchDecision | null;
    pendingPodReplacement?: PendingPodReplacement | null;
}

/**
 * In-memory {@link AppStateStore} for tests, exposing the stored values for
 * assertions. Shared by the sync test suites.
 */
export function fakeAppState(seed?: AppStateStoreSeed) {
    let webId: string | null = seed?.webId ?? null;
    let lastSyncedAt: Date | null = seed?.lastSyncedAt ?? null;
    let syncPending: boolean = seed?.syncPending ?? false;
    let identitySwitchChoice: IdentitySwitchDecision | null = seed?.identitySwitchChoice ?? null;
    let pendingPodReplacement: PendingPodReplacement | null = seed?.pendingPodReplacement ?? null;
    const store: AppStateStore = {
        getWebId: async () => webId,
        setWebId: async (v) => { webId = v; },
        getLastSyncedAt: async () => lastSyncedAt,
        setLastSyncedAt: async (d) => { lastSyncedAt = d; },
        isSyncPending: async () => syncPending,
        setSyncPending: async (pending) => { syncPending = pending; },
        getIdentitySwitchChoice: async () => identitySwitchChoice,
        setIdentitySwitchChoice: async (decision) => { identitySwitchChoice = decision; },
        getPendingPodReplacement: async () => pendingPodReplacement,
        setPendingPodReplacement: async (pending) => { pendingPodReplacement = pending; },
    };
    return {
        store,
        getWebId: () => webId,
        getLastSyncedAt: () => lastSyncedAt,
        isSyncPending: () => syncPending,
        getIdentitySwitchChoice: () => identitySwitchChoice,
        getPendingPodReplacement: () => pendingPodReplacement,
    };
}
