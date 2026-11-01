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

    /**
     * Prepare the current session's Pod to receive the local data in place of
     * its own (a WebID switch that kept the local data): move the local data
     * from the Pod base it was synced with (`fromBase`, null if never synced) to
     * the current Pod's base, erase the Kellermeister collections on the current
     * Pod, and mark all local documents as never synced, so the next
     * `synchronize` uploads them all and pulls nothing of the Pod's old data.
     *
     * Uploads nothing itself. MUST be idempotent: re-running it after an
     * interruption leaves the same result.
     */
    replacePod(fromBase: string | null): Promise<void>;
}
