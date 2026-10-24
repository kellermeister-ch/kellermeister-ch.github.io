import {Container, getEngine, MigrateLocalUrls, SolidEngine, Sync, TypeIndex, TypeRegistration, type Engine, type ManagesContainers} from "soukai-bis";
import {fetchLoginUserProfile, type SolidUserProfile} from "@noeldemartin/solid-utils";
import type {AuthService, SolidSession} from "../../application/ports/AuthService.ts";
import {initialSyncProgress, type SyncService, type SyncOutcome, type SyncProgress, type SyncProgressListener} from "../../application/ports/SyncService.ts";
import {toSyncProgress} from "./syncProgressFromJob.ts";
import {LOCAL_BASE, WELL_KNOWN_CELLAR} from "../shared/resource-identity.ts";
import {withLocalEngine} from "../soukai/engineScope.ts";
import {POD_CONTAINER_PATH} from "./podContainerPath.ts";
import {SoukaiCellar} from "../soukai/model/SoukaiCellar.ts";
import {SoukaiProduct} from "../soukai/model/SoukaiProduct.ts";
import {SoukaiBottle} from "../soukai/model/SoukaiBottle.ts";
import {SoukaiOrder} from "../soukai/model/SoukaiOrder.ts";

/** The local engine must manage containers (for MigrateLocalUrls / Sync). */
type LocalEngine = Engine & ManagesContainers;

/**
 * The four aggregate roots, each under its Pod subcontainer
 * (`{storage}private/kellermeister/v1/<collection>/`). Same-document relations
 * (an order's seller/customer/items, a product's ratings) travel inside their
 * parent document, so only the roots are registered/synced.
 *
 * The order matters: Sync lists its containers in type-index registration
 * order, which the sync progress rows rely on (see `SYNC_COLLECTIONS`).
 */
export const APPLICATION_MODELS = [
    {model: SoukaiCellar, collection: "cellars"},
    {model: SoukaiProduct, collection: "products"},
    {model: SoukaiBottle, collection: "bottles"},
    {model: SoukaiOrder, collection: "orders"},
] as const;

/**
 * Reconciles local (IndexedDB) state with the Pod using soukai-bis. This is the
 * ONLY component that reaches the Pod for domain data.
 *
 * Two phases:
 *   1. Re-home — migrate provisional (`local://…`) resources to deterministic Pod
 *      URLs in the local store, rewriting their cross-resource references, via
 *      soukai-bis's `MigrateLocalUrls` (plus a fixup for the one reference it can
 *      not touch — see `fixCellarReferences`).
 *   2. Sync    — push/pull whole documents between the local and Pod engines with
 *      soukai-bis's `Sync` job (operation-log + type-index driven). Last-write and
 *      soft-delete (tombstone) propagation are handled by the job.
 */
export class SolidSyncService implements SyncService {

    /**
     * Guards the one-time well-known-cellar baseline reconciliation (see
     * {@link reconcileWellKnownCellarBaselines}). Scoped to this instance, i.e.
     * once per app session.
     */
    private wellKnownReconciled = false;

    /**
     * @param remoteEngine builds the engine used for Pod reads/writes. Defaults to
     *   `SolidEngine` over the authenticated fetch; overridable in tests.
     * @param fetchProfile loads the `SolidUserProfile` Sync needs (storage roots,
     *   type-index location). Defaults to solid-utils; overridable in tests.
     * @param localEngine the local (IndexedDB) engine. Defaults to the global
     *   engine; overridable in tests.
     */
    constructor(
        private readonly auth: AuthService,
        private readonly podBase: () => string | null,
        private readonly remoteEngine: (session: SolidSession) => SolidEngine = (session) => new SolidEngine({fetch: session.fetch}),
        private readonly fetchProfile: (session: SolidSession) => Promise<SolidUserProfile | null> =
            (session) => fetchLoginUserProfile(session.webId as string, {fetch: session.fetch}),
        private readonly localEngine: () => LocalEngine = () => getEngine() as LocalEngine,
    ) {
    }

    async synchronize(onProgress?: SyncProgressListener): Promise<SyncOutcome> {
        let progress: SyncProgress = initialSyncProgress();
        const report = (patch: Partial<SyncProgress>) => {
            progress = {...progress, ...patch};
            onProgress?.(progress);
        };

        const session = this.auth.getSession();
        if (!session.isLoggedIn || !session.webId) {
            throw new Error("Cannot synchronize without an authenticated session.");
        }
        const base = this.podBase();
        if (!base) {
            throw new Error("Cannot synchronize before the Pod container is resolved.");
        }
        report({step: "profile"});
        const profile = await this.fetchProfile(session);
        if (!profile) {
            throw new Error("Cannot synchronize: could not load the Solid user profile.");
        }

        const localEngine = this.localEngine();
        const remoteEngine = this.remoteEngine(session);

        // 1. Re-home provisional resources to their Pod URLs (local, in place).
        report({step: "prepare"});
        const rehomed = await this.rehome(localEngine, base);

        // 2. Reconcile local and Pod documents. Pull reads the containers listed
        // in the type index, so give Sync a type index that registers our four
        // containers — the legacy Pod has none, and without it pull finds nothing.
        // The job is built here rather than through `Sync.run`, which does not hand
        // it out: its status tree (`serialize()`) carries the per-container counts.
        let synced = 0;
        const job = new Sync({
            userProfile: profile,
            localEngine,
            remoteEngine,
            typeIndexes: [this.buildTypeIndex(base)],
            applicationModels: APPLICATION_MODELS.map(({model, collection}) => ({
                model,
                registration: {path: `${POD_CONTAINER_PATH}${collection}`},
            })),
        });
        const collections = APPLICATION_MODELS.map(({collection}) => collection);
        job.listeners.add({
            onUpdated: (overall) => report(toSyncProgress(job.serialize(), overall, collections, progress.overall)),
            onFinished: ({syncedDocumentUrls}) => {
                synced = syncedDocumentUrls.size;
            },
        });
        // A failed run also rejects `job.completed`; the error reaches us through
        // `start()`, so keep that second rejection from going unhandled.
        job.completed.catch(() => {});
        await job.start();

        // 3. Stop the well-known cellars from being re-pulled on every sync.
        report({step: "finish"});
        await this.reconcileWellKnownCellarBaselines(localEngine, remoteEngine, base);

        return {reconciled: rehomed + synced};
    }

    /**
     * The two well-known cellars (`cellarwork`, `altglass`) are created locally on
     * every device (for offline-first use) *and* already exist on the Pod, so
     * soukai-bis's `Sync` takes its document-merge path for them instead of a
     * clean pull. That path pushes nothing but writes the local `lastModifiedAt`
     * back as an estimate (~sync time) that never equals the Pod's `dc:modified`,
     * so `Sync.skipDocumentPull` can never skip them and they are re-fetched on
     * EVERY subsequent sync (verified: the only per-document GETs a no-op sync
     * makes). Regular resources avoid this because they are pulled remote-only and
     * inherit the Pod's real last-modified.
     *
     * Fix: once per session, align each well-known cellar's local `lastModifiedAt`
     * to the Pod's actual `dc:modified` (read from the cellars container listing,
     * the same millisecond-precision value `Sync` compares against), so the next
     * sync skips them. Idempotent and best-effort — any failure simply leaves the
     * prior (correct but chatty) behaviour in place.
     */
    private async reconcileWellKnownCellarBaselines(
        localEngine: LocalEngine,
        remoteEngine: SolidEngine,
        base: string,
    ): Promise<void> {
        if (this.wellKnownReconciled) {
            return;
        }
        const containerUrl = `${base}cellars/`;
        const remoteContainer = await remoteEngine.readDocumentIfExists(containerUrl);
        if (!remoteContainer) {
            return; // no cellars container yet — retry on a later sync
        }
        const container = await Container.createFromDocument(remoteContainer, {url: containerUrl});
        const resources = container?.resources ? [container.resources].flat() : [];
        const modifiedByUrl = new Map<string, Date | undefined>(
            resources.map((resource) => [resource.url as string, resource.updatedAt as Date | undefined]),
        );
        for (const slug of Object.values(WELL_KNOWN_CELLAR)) {
            const documentUrl = `${base}cellars/${slug}`;
            const podModified = modifiedByUrl.get(documentUrl);
            if (!podModified) {
                continue;
            }
            try {
                await localEngine.updateDocument(documentUrl, [], {lastModifiedAt: podModified});
            } catch {
                // The cellar isn't present locally (never synced) — nothing to align.
            }
        }
        this.wellKnownReconciled = true;
    }

    /**
     * An in-memory private type index registering each aggregate's Pod container
     * (`{base}<collection>/`). Sync's pull discovers documents to fetch from the
     * containers listed here; the legacy Pod data was written under fixed paths
     * with no type index, so we supply one rather than depend on the Pod's.
     */
    private buildTypeIndex(base: string): TypeIndex {
        const typeIndex = new TypeIndex({url: `${base}typeindex#it`});
        for (const {model, collection} of APPLICATION_MODELS) {
            const registration = new TypeRegistration({
                forClass: model.schema.rdfClasses.map((rdfClass) => rdfClass.value),
                instanceContainer: `${base}${collection}/`,
            });
            typeIndex.relatedRegistrations.addRelated(registration);
        }
        return typeIndex;
    }

    /**
     * Migrate every provisional `local://…` resource to its deterministic Pod URL
     * in the local store. `MigrateLocalUrls` rewrites container URLs, document
     * URLs, and cross-references stored as IRIs (NamedNodes: productUrl, orderUrl,
     * seller/customer/positions, ratings, …). It cannot touch a reference stored
     * as a string literal, which `cellarUrl` is (kept a literal for on-Pod
     * compatibility) — so those are fixed up separately. Idempotent.
     */
    async rehome(localEngine: LocalEngine, base: string): Promise<number> {
        await MigrateLocalUrls.run({engine: localEngine, migrations: {[LOCAL_BASE]: base}});
        return await withLocalEngine(() => this.fixCellarReferences(base));
    }

    /**
     * Rewrite bottles' `cellarUrl` (a string literal, not an IRI) from the
     * provisional `local://` scheme to the Pod base, so a re-homed bottle still
     * points at its (also re-homed) cellar.
     */
    private async fixCellarReferences(base: string): Promise<number> {
        let fixed = 0;
        for (const bottle of await SoukaiBottle.all({from: `${base}bottles/`})) {
            if (bottle.cellarUrl?.startsWith(LOCAL_BASE)) {
                bottle.cellarUrl = `${base}${bottle.cellarUrl.substring(LOCAL_BASE.length)}`;
                await bottle.save();
                fixed++;
            }
        }
        return fixed;
    }
}
