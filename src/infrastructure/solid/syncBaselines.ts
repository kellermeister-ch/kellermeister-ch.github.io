import type {Engine, ManagesDocuments} from "soukai-bis";

/** A local document's last-modified baseline per document URL (null = unsynced). */
export type Baselines = Record<string, Date | null>;

/** Reads a Pod container listing: each member document's `dc:modified`. */
export type ContainerListingReader = (containerUrl: string) => Promise<Map<string, Date>>;

/**
 * soukai-bis's `Sync` skips pulling a document when its local `lastModifiedAt`
 * baseline matches the `dc:modified` in the Pod's container listing. But a
 * document that takes the merge path (it exists locally AND on the Pod with a
 * mismatched baseline) and has nothing to push gets an estimate (~sync time) as
 * its new baseline, because there is no Pod response to read the real date from.
 * That estimate never matches the listing, so the document is fetched and merged
 * again on every sync, forever — a device whose local store once got into that
 * state fetches every document on every sync.
 *
 * This puts the Pod's own `dc:modified` onto every baseline the sync just wrote,
 * so the next sync skips those documents. Only baselines that changed during the
 * sync are considered, so a sync that touched nothing costs no extra request.
 *
 * Two guards keep a change from being missed:
 *  - an unsynced document (baseline null) keeps its null, so its local edits are
 *    still pushed;
 *  - a Pod date at or after `syncStartedAt` is left alone: that version may be a
 *    change made after the sync read the document, which must still be pulled.
 *
 * @returns the number of baselines aligned.
 */
export async function alignChangedBaselines(
    localEngine: Engine & ManagesDocuments,
    before: Baselines,
    syncStartedAt: Date,
    readListing: ContainerListingReader,
): Promise<number> {
    const after = await localEngine.getDocumentsLastModifiedAt();
    const changedByContainer = new Map<string, string[]>();
    for (const [url, baseline] of Object.entries(after)) {
        if (url.endsWith("/") || !baseline || baseline.getTime() === before[url]?.getTime()) {
            continue;
        }
        const containerUrl = url.substring(0, url.lastIndexOf("/") + 1);
        changedByContainer.set(containerUrl, [...(changedByContainer.get(containerUrl) ?? []), url]);
    }

    let aligned = 0;
    for (const [containerUrl, urls] of changedByContainer) {
        const podModified = await readListing(containerUrl);
        const current = await localEngine.getDocumentsLastModifiedAt();
        for (const url of urls) {
            const modified = podModified.get(url);
            const baseline = current[url];
            if (!modified || !baseline || modified >= syncStartedAt || modified.getTime() === baseline.getTime()) {
                continue;
            }
            await localEngine.updateDocument(url, [], {lastModifiedAt: modified});
            aligned++;
        }
    }
    return aligned;
}
