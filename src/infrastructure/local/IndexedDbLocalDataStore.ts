import {getEngine, getNamespace, IndexedDBEngine} from "soukai-bis";
import type {LocalDataStore} from "../../application/ports/LocalDataStore.ts";
import type {PodContainerRegistry} from "../solid/PodContainerRegistry.ts";
import {APP_STATE_DB_NAME} from "./IndexedDbAppStateStore.ts";

/**
 * Wipes this device's identity-scoped local state:
 *
 *  - the Soukai domain data (cellars, bottles, products, orders);
 *  - the app-state database (recorded WebID, last-sync date, pending-sync flag);
 *  - the resolved Pod container base, in localStorage AND in memory.
 *
 * The list of WebIDs offered for login is deliberately left alone: it is a
 * device-level convenience list the user typed themselves, not data belonging to
 * an identity, and clearing it would only make switching back harder.
 */
export class IndexedDbLocalDataStore implements LocalDataStore {

    constructor(private readonly containers: PodContainerRegistry) {
    }

    async wipe(): Promise<void> {
        await this.purgeDomainData();
        await deleteDatabase(APP_STATE_DB_NAME);
        this.containers.clear();
    }

    getPodBase(): string | null {
        return this.containers.get();
    }

    detachFromPod(): void {
        this.containers.clear();
    }

    /**
     * Purge the soukai-bis database. `indexedDB.deleteDatabase` blocks while
     * connections are open and the global engine holds them, so close the engine
     * first, then delete the database (named after the soukai-bis namespace).
     */
    private async purgeDomainData(): Promise<void> {
        const engine = getEngine();
        if (engine instanceof IndexedDBEngine) {
            await engine.close();
        }
        await deleteDatabase(getNamespace());
    }
}

/** Delete an IndexedDB database by name; a missing database is not an error. */
function deleteDatabase(name: string): Promise<void> {
    if (typeof indexedDB === "undefined") {
        return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onblocked = () => resolve(); // no open connection of ours; the delete completes once the page goes away
        request.onerror = () => reject(request.error);
    });
}
