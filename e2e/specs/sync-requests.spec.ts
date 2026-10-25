import {test, expect} from '../fixtures/auth';
import {POD_ORIGIN} from '../helpers/pod';
import type {Page, Request} from '@playwright/test';

/**
 * Instrumented measurement of the Pod HTTP traffic a sync produces (change
 * `optimize-sync-last-modified`, tasks 1.1 / 1.2 / 5.1 / 5.2).
 *
 * The first sync happens during login (the `authedPage` fixture); it necessarily
 * pulls the whole Pod, so it is NOT what we measure. We measure the SECOND sync
 * (nothing changed → should be container reads only, zero per-document GETs) and
 * a THIRD sync (idempotency / convergence check).
 *
 * A sync is bracketed precisely by the coordinator's own console lines
 * ("run: started..." / "run: finished in (seconds)"), so only in-sync Pod
 * traffic is counted.
 */

const V1 = `${POD_ORIGIN}/edwin/private/kellermeister/v1/`;
const COLLECTIONS = ['cellars', 'products', 'bottles', 'orders'] as const;

interface SyncTraffic {
    all: {method: string; url: string}[];
    containerGETs: string[];
    documentGETs: string[];
    writes: {method: string; url: string}[]; // PUT/PATCH/POST/DELETE to the Pod
    other: {method: string; url: string}[];   // HEAD, well-known, profile, typeindex, ...
}

function classify(reqs: {method: string; url: string}[]): SyncTraffic {
    const t: SyncTraffic = {all: reqs, containerGETs: [], documentGETs: [], writes: [], other: []};
    for (const r of reqs) {
        const isWrite = r.method !== 'GET' && r.method !== 'HEAD';
        if (isWrite) {
            t.writes.push(r);
            continue;
        }
        const inCollection = COLLECTIONS.some((c) => r.url.startsWith(`${V1}${c}`));
        if (r.method === 'GET' && inCollection) {
            const path = r.url.split('#')[0].split('?')[0];
            if (path.endsWith('/')) t.containerGETs.push(path);
            else t.documentGETs.push(path);
            continue;
        }
        t.other.push(r);
    }
    return t;
}

/**
 * Trigger one manual sync and return the Pod requests issued while it ran.
 * Capture is gated on the coordinator's console lines so nothing before/after
 * the run leaks into the count.
 */
async function measureOneSync(page: Page, label: string): Promise<SyncTraffic> {
    const captured: {method: string; url: string}[] = [];
    let capturing = false;
    let finished = false;

    const onRequest = (req: Request) => {
        if (!capturing) return;
        const url = req.url();
        if (url.startsWith(POD_ORIGIN)) captured.push({method: req.method(), url});
    };
    const onConsole = (msg: {text: () => string}) => {
        const text = msg.text();
        if (text.includes('run: started')) capturing = true;
        if (text.includes('run: finished')) {
            capturing = false;
            finished = true;
        }
    };

    page.on('request', onRequest);
    page.on('console', onConsole);
    try {
        await page.getByRole('button', {name: /Sync/i}).first().click();
        await expect.poll(() => finished, {timeout: 180_000, message: `sync "${label}" did not finish`}).toBe(true);
    } finally {
        page.off('request', onRequest);
        page.off('console', onConsole);
    }

    const traffic = classify(captured);
    const perCollection = COLLECTIONS.map((c) => {
        const docs = traffic.documentGETs.filter((u) => u.startsWith(`${V1}${c}/`)).length;
        return `${c}=${docs}`;
    }).join(' ');
    // eslint-disable-next-line no-console
    console.log(
        `\n[sync-requests] ${label}: total=${traffic.all.length} ` +
            `containerGETs=${traffic.containerGETs.length} documentGETs=${traffic.documentGETs.length} ` +
            `writes=${traffic.writes.length} other=${traffic.other.length}\n` +
            `[sync-requests] ${label}: docGETs per collection: ${perCollection}\n` +
            `[sync-requests] ${label}: documentGET urls: ${traffic.documentGETs.map((u) => u.slice(V1.length)).join(', ')}\n` +
            `[sync-requests] ${label}: other urls: ${traffic.other.map((r) => `${r.method} ${r.url.replace(POD_ORIGIN, '')}`).join(', ')}`,
    );
    return traffic;
}

test.describe('sync request volume', () => {
    test('a no-op sync should not re-fetch every document (baseline measurement)', async ({authedPage}) => {
        const page = authedPage;

        // Second sync: nothing changed since the login sync.
        const second = await measureOneSync(page, 'sync #2 (no-op)');
        // Third sync: must be stable/converged relative to the second.
        const third = await measureOneSync(page, 'sync #3 (no-op, convergence)');

        // A no-op sync must not re-fetch any domain document. Before the
        // baseline alignment this was 2 (cellarwork + altglass were re-pulled on
        // every sync forever); it must now be 0.
        expect(second.documentGETs, `unexpected document GETs: ${second.documentGETs.join(', ')}`).toHaveLength(0);
        expect(third.documentGETs, `unexpected document GETs: ${third.documentGETs.join(', ')}`).toHaveLength(0);

        // A no-op sync writes nothing back to the Pod.
        expect(second.writes).toHaveLength(0);
        expect(third.writes).toHaveLength(0);

        // Container reads only: one listing per collection. The baseline
        // alignment reads a listing only when the sync changed a baseline, so a
        // no-op sync adds none.
        expect(third.containerGETs.length).toBeLessThanOrEqual(COLLECTIONS.length);
    });

    test('a local store whose baselines went stale heals in one sync (no per-document GETs afterwards)', async ({authedPage}) => {
        test.setTimeout(600_000);
        const page = authedPage;

        // Put the local store into the state seen on an iPhone: every synced
        // document's baseline is an estimate (~sync time) instead of the Pod's
        // dc:modified, as soukai-bis writes after a merge that pushes nothing.
        // Without the alignment, every sync then re-fetches every document.
        const staled = await page.evaluate(() => new Promise<number>((resolve, reject) => {
            const open = indexedDB.open('kellermeister');
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
                const db = open.result;
                const transaction = db.transaction('documents', 'readwrite');
                const now = new Date();
                let count = 0;
                const cursorRequest = transaction.objectStore('documents').openCursor();
                cursorRequest.onsuccess = () => {
                    const cursor = cursorRequest.result;
                    if (!cursor) return;
                    const url = String(cursor.primaryKey);
                    if (!url.endsWith('/') && cursor.value.lastModifiedAt instanceof Date) {
                        cursor.update({...cursor.value, lastModifiedAt: now});
                        count++;
                    }
                    cursor.continue();
                };
                transaction.oncomplete = () => {
                    db.close();
                    resolve(count);
                };
                transaction.onerror = () => reject(transaction.error);
            };
        }));
        expect(staled, 'no synced documents to make stale').toBeGreaterThan(0);

        // The healing sync still fetches the documents (that is how the stale
        // state shows) and leaves correct baselines behind. Merging every
        // document may also push a local-only change it now notices, so its
        // writes are not asserted.
        const healing = await measureOneSync(page, 'sync #2 (stale baselines)');
        expect(healing.documentGETs.length).toBeGreaterThan(0);

        const healed = await measureOneSync(page, 'sync #3 (healed)');
        expect(healed.documentGETs, `unexpected document GETs: ${healed.documentGETs.join(', ')}`).toHaveLength(0);
        expect(healed.writes).toHaveLength(0);
    });
});
