/**
 * Local, device-scoped app metadata that is NOT synced to the Pod: the WebID
 * used to authenticate, the date of the last successful synchronization, and
 * whether a sync is still owed to the user (see PendingSync), and the state of a
 * switch to another WebID. Persisted so all
 * of it survives a reload — including the navigation away from the app that the
 * OIDC login flow performs — and is readable offline / before a session is
 * restored. The concrete implementation lives in infrastructure.
 */
export interface AppStateStore {
    getWebId(): Promise<string | null>;
    setWebId(webId: string): Promise<void>;

    getLastSyncedAt(): Promise<Date | null>;
    setLastSyncedAt(date: Date | null): Promise<void>;

    isSyncPending(): Promise<boolean>;
    setSyncPending(pending: boolean): Promise<void>;

    /**
     * What the user chose to keep when switching to another WebID, if a choice
     * is outstanding. Recorded before the login flow navigates away so the
     * question is not asked a second time when the session comes back; scoped to
     * that one WebID, so an identity provider authenticating someone else is
     * still asked separately.
     */
    getIdentitySwitchChoice(): Promise<IdentitySwitchDecision | null>;
    setIdentitySwitchChoice(decision: IdentitySwitchDecision | null): Promise<void>;

    /**
     * A switch that kept the local data and still has to replace the new Pod's
     * data, if any. Persisted until the replacement has completed, so an
     * interrupted switch is completed by the next sync before anything is
     * uploaded (see SynchronizeWithPod).
     */
    getPendingPodReplacement(): Promise<PendingPodReplacement | null>;
    setPendingPodReplacement(pending: PendingPodReplacement | null): Promise<void>;
}

/** Which data survives a switch to another WebID. */
export type IdentitySwitchChoice =
    /** Delete the local data and load the new Pod's data. */
    | "keep-pod"
    /** Keep the local data and replace the new Pod's Kellermeister data with it. */
    | "keep-local";

export interface IdentitySwitchDecision {
    webId: string;
    choice: IdentitySwitchChoice;
}

export interface PendingPodReplacement {
    /** The WebID whose Pod receives the local data. */
    webId: string;
    /** The Pod container base the local data was synced with, if any. */
    fromBase: string | null;
}
