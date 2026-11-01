import type {AuthService} from "../ports/AuthService.ts";
import type {AppStateStore} from "../ports/AppStateStore.ts";
import type {ReconnectSync} from "./ReconnectSync.ts";

/**
 * Remembers a sync the user asked for but that could not run yet because there
 * was no session: pressing Sync while logged out starts the OIDC login flow,
 * which navigates away from the app. The intent is persisted, so it survives
 * that round trip and the requested sync runs once the session is back.
 *
 * This is what distinguishes "the user returned from a login redirect" from
 * "the user hit reload": a plain refresh carries no flag and therefore starts
 * no sync. Reconnect-driven syncs are unaffected (see ConnectivityMonitor).
 */
export class PendingSync {

    /**
     * @param podResolved whether the Pod container base is known yet. A sync
     *   cannot run before it is, and on a first login it is resolved only after
     *   the session is restored — so both entry points (startup and container
     *   resolution) may call `run()`, and whichever is ready first performs the
     *   single remembered sync.
     */
    constructor(
        private readonly auth: AuthService,
        private readonly appState: AppStateStore,
        private readonly reconnectSync: ReconnectSync,
        private readonly podResolved: () => boolean,
    ) {
    }

    /** Record the intent to sync, before handing over to the login redirect. */
    async remember(): Promise<void> {
        await this.appState.setSyncPending(true);
    }

    /**
     * Run a remembered sync, if there is one. Without a session — before the
     * Pod container is resolved, or before the session's WebID is adopted as
     * this device's identity — the flag is kept: the request could not be
     * served yet, so the user is still owed the sync. Otherwise the flag is
     * cleared BEFORE syncing, so a sync that keeps failing (`ReconnectSync`
     * already retries with backoff) cannot turn into a request that is replayed
     * on every single startup.
     */
    async run(): Promise<void> {
        if (!await this.appState.isSyncPending() || !this.auth.isLoggedIn() || !this.podResolved()) {
            return;
        }
        // A session that is not adopted as this device's identity yet (a WebID
        // switch is still being settled) cannot sync either; keep the request
        // for the run after the switch.
        if (await this.appState.getWebId() !== this.auth.getSession().webId) {
            return;
        }
        await this.appState.setSyncPending(false);
        await this.reconnectSync.run();
    }
}
