/**
 * The result of a single synchronization run.
 */
export interface SyncOutcome {
    reconciled: number;
}

/**
 * The steps of a synchronization run, in order: load the user's profile,
 * prepare local data (re-home provisional resources), pull from the Pod, push
 * local changes, and finish up.
 */
export type SyncStep = "profile" | "prepare" | "pull" | "push" | "finish";

/** The synced collections, one Pod container each. */
export type SyncCollection = "cellars" | "products" | "bottles" | "orders";

export const SYNC_COLLECTIONS: readonly SyncCollection[] = ["cellars", "products", "bottles", "orders"];

/**
 * Progress through one container: documents processed so far, out of `total`
 * — which is `null` until the container's listing has been read.
 */
export interface ContainerProgress {
    collection: SyncCollection;
    done: number;
    total: number | null;
}

/** A snapshot of a running synchronization's progress. */
export interface SyncProgress {
    step: SyncStep;
    /** Overall share completed, 0..1; never decreases within a run. */
    overall: number;
    containers: ContainerProgress[];
}

export type SyncProgressListener = (progress: SyncProgress) => void;

/** The snapshot a run starts from: nothing listed, nothing done. */
export function initialSyncProgress(): SyncProgress {
    return {
        step: "profile",
        overall: 0,
        containers: SYNC_COLLECTIONS.map((collection) => ({collection, done: 0, total: null})),
    };
}

/**
 * Application port: reconciles local (IndexedDB) state with the Solid Pod.
 * The concrete implementation lives in infrastructure and is the ONLY component
 * that reaches the Pod for domain data.
 */
export interface SyncService {
    synchronize(onProgress?: SyncProgressListener): Promise<SyncOutcome>;
}
