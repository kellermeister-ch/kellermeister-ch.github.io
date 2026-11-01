/**
 * Raised when an operation that requires an authenticated Solid session is
 * attempted without one (e.g. a manual sync while logged out). The UI can catch
 * this to prompt for login.
 */
export class NotAuthenticatedError extends Error {
    constructor() {
        super("This operation requires an authenticated Solid session.");
        this.name = "NotAuthenticatedError";
    }
}

/**
 * A sync was requested for a session whose WebID is not the one a pending
 * "keep the local data" switch is meant for. Syncing would replace (or merge
 * into) the wrong Pod, so nothing is done.
 */
export class PendingSwitchMismatchError extends Error {
    constructor(sessionWebId: string | null, pendingWebId: string) {
        super(`A switch to ${pendingWebId} is pending; refusing to sync the session of ${sessionWebId}.`);
        this.name = "PendingSwitchMismatchError";
    }
}

/**
 * A sync was requested for a session whose WebID has not been adopted as this
 * device's identity yet (see SwitchIdentity). Until it is, the local data and
 * the resolved Pod base may still belong to the previous identity, so nothing
 * may reach any Pod.
 */
export class IdentityNotAdoptedError extends Error {
    constructor(sessionWebId: string | null, recordedWebId: string | null) {
        super(`The session's WebID ${sessionWebId} is not adopted yet (recorded: ${recordedWebId}); not syncing.`);
        this.name = "IdentityNotAdoptedError";
    }
}
