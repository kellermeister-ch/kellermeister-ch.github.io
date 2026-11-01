import type {AppStateStore, IdentitySwitchChoice} from "../ports/AppStateStore.ts";
import type {LocalDataStore} from "../ports/LocalDataStore.ts";

/** What the caller must do about a WebID that is about to be adopted. */
export type IdentityCheck =
    /** Same WebID as recorded, or none recorded yet — adopt it, change nothing. */
    | {kind: "proceed"}
    /** A different WebID — the user must choose which data to keep first. */
    | {kind: "choice-required"; previousWebId: string};

/**
 * Ties the local store to the WebID that owns it.
 *
 * Local data is the source of truth in this app and is re-homed to whichever Pod
 * the user is logged into, so adopting a session for a DIFFERENT WebID must
 * first settle whose data survives: either the local data is deleted and the
 * new Pod's data is loaded ("keep-pod"), or the local data is handed to the new
 * identity and replaces the new Pod's Kellermeister data ("keep-local"). This
 * use case decides when that applies and performs the switch in an order that
 * is safe to interrupt.
 *
 * The user's choice is NOT asked here: callers ask first (the UI owns that) and
 * only then call `switchTo`.
 */
export class SwitchIdentity {

    constructor(
        private readonly appState: AppStateStore,
        private readonly localData: LocalDataStore,
    ) {
    }

    /**
     * Whether adopting `webId` requires a choice first. An absent record means
     * first use on this device, NOT a switch: the local data was created by this
     * same user before authenticating (the app is usable offline), so it must
     * survive and be syncable.
     */
    async check(webId: string): Promise<IdentityCheck> {
        const recorded = await this.appState.getWebId();
        if (!recorded || recorded === webId) {
            return {kind: "proceed"};
        }
        return {kind: "choice-required", previousWebId: recorded};
    }

    /**
     * Adopt `webId` as this device's identity. For a different WebID, `choice`
     * says which data survives and is required. For the same WebID (or a first
     * use) only the record is written.
     *
     * Returns whether in-memory state from before the switch is now stale (the
     * local data or the resolved Pod base changed), so the caller reloads.
     */
    async switchTo(webId: string, choice?: IdentitySwitchChoice): Promise<boolean> {
        const check = await this.check(webId);
        if (check.kind === "proceed") {
            await this.dropPendingReplacementOfOtherIdentity(webId);
            await this.appState.setWebId(webId);
            return false;
        }
        if (!choice) {
            throw new Error(`switchTo: switching from ${check.previousWebId} to ${webId} requires a choice`);
        }
        if (choice === "keep-pod") {
            await this.keepPod(webId);
        } else {
            await this.keepLocal(webId);
        }
        return true;
    }

    /**
     * Delete the local data and THEN record the new WebID.
     *
     * The order matters and is deliberately not reversed: the wipe deletes the
     * store holding the record, so recording first would erase it again. If the
     * app dies between the two steps, no record remains and the next login
     * counts as first use — safe, because the data is already gone.
     */
    private async keepPod(webId: string): Promise<void> {
        await this.localData.wipe();
        await this.appState.setWebId(webId);
    }

    /**
     * Hand the local data to `webId`: remember that its Pod's Kellermeister data
     * must be replaced (done by the next sync, which needs the session), detach
     * the local data from the previous Pod, and THEN record the new WebID.
     *
     * The pending replacement is written first, so no state exists in which the
     * new WebID owns the local data without the replacement being owed. If the
     * app dies before the WebID is recorded, the next login is still a switch
     * and asks again; a repeated "keep-local" keeps the base recorded the first
     * time, because the detach may already have forgotten it.
     */
    private async keepLocal(webId: string): Promise<void> {
        const earlier = await this.appState.getPendingPodReplacement();
        const fromBase = earlier?.webId === webId ? earlier.fromBase : this.localData.getPodBase();
        await this.appState.setPendingPodReplacement({webId, fromBase});
        this.localData.detachFromPod();
        await this.appState.setLastSyncedAt(null);
        // Complete the replacement with a sync right after login.
        await this.appState.setSyncPending(true);
        await this.appState.setWebId(webId);
    }

    /**
     * A "keep-local" switch that was interrupted before the new WebID was
     * recorded leaves a replacement for that WebID behind. If the user then
     * returns to the recorded identity instead, that replacement no longer
     * applies — and would otherwise block every sync of this identity.
     */
    private async dropPendingReplacementOfOtherIdentity(webId: string): Promise<void> {
        const pending = await this.appState.getPendingPodReplacement();
        if (pending && pending.webId !== webId) {
            await this.appState.setPendingPodReplacement(null);
        }
    }
}
