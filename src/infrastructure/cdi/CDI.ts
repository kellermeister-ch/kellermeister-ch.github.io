import {InruptSolidService} from "../solid/InruptSolidService.ts";
import {InruptAuthService} from "../solid/InruptAuthService.ts";
import {PodContainerRegistry} from "../solid/PodContainerRegistry.ts";
import {SolidSyncService} from "../solid/SolidSyncService.ts";
import type {SolidService} from "../../application/authentication/SolidService.ts";
import type {AuthService} from "../../application/ports/AuthService.ts";
import type {AppStateStore} from "../../application/ports/AppStateStore.ts";
import {IndexedDbAppStateStore} from "../local/IndexedDbAppStateStore.ts";
import {IndexedDbLocalDataStore} from "../local/IndexedDbLocalDataStore.ts";
import {SwitchIdentity} from "../../application/identity/SwitchIdentity.ts";
import {SolidInboxUploader} from "../solid/SolidInboxUploader.ts";
import type {InboxUploader} from "../../application/ports/InboxUploader.ts";
import {HttpOrderConversionService} from "../http/HttpOrderConversionService.ts";
import {MockOrderConversionService, MOCKED_CONVERSION_ENDPOINT} from "../http/MockOrderConversionService.ts";
import type {OrderConversionService} from "../../application/ports/OrderConversionService.ts";
import type {CellarRepository} from "../../domain/Cellar/CellarRepository.ts";
import {KellermeisterService} from "../../application/KellermeisterService.ts";
import {SynchronizeWithPod} from "../../application/sync/SynchronizeWithPod.ts";
import {SyncCoordinator} from "../../application/sync/SyncCoordinator.ts";
import {ReconnectSync} from "../../application/sync/ReconnectSync.ts";
import {PendingSync} from "../../application/sync/PendingSync.ts";
import {SoukaiCellarRepository} from "../soukai/SoukaiCellarRepository.ts";
import {SoukaiBottleRepository} from "../soukai/SoukaiBottleRepository.ts";
import {SoukaiProductRepository} from "../soukai/SoukaiProductRepository.ts";
import {SoukaiOrderRepository} from "../soukai/SoukaiOrderRepository.ts";
import {SoukaiBottleFactory} from "../soukai/model/SoukaiBottleFactory.ts";
import {SoukaiProductFactory} from "../soukai/model/SoukaiProductFactory.ts";
import {SoukaiOrderFactory} from "../soukai/model/SoukaiOrderFactory.ts";

/**
 * Dependency Injection Container.
 *
 * Local-first: repositories are constructed eagerly at startup and are
 * local-only (IndexedDB) — no `storageUrl` is required to use the app. The Pod
 * container base is resolved lazily after login (via `setPodContainerBase`) and
 * the sync layer is the only path that reaches the Pod.
 */
export class CDI {

    private static instance: CDI;

    private readonly containers: PodContainerRegistry;

    private readonly solidService: SolidService;
    private readonly authService: AuthService;
    private readonly appStateStore: AppStateStore;

    private readonly cellarRepository: CellarRepository;
    private readonly kellermeisterService: KellermeisterService;
    private readonly syncService: SolidSyncService;
    private readonly syncCoordinator: SyncCoordinator;
    private readonly reconnectSync: ReconnectSync;
    private readonly pendingSync: PendingSync;
    private readonly switchIdentity: SwitchIdentity;
    private readonly inboxUploader: InboxUploader;
    private readonly orderConversionService: OrderConversionService;

    private constructor() {
        this.containers = new PodContainerRegistry();
        const podBase = () => this.containers.get();

        // Auth
        this.solidService = new InruptSolidService();
        this.authService = new InruptAuthService();

        // Local, device-scoped app metadata (webId, last sync date)
        this.appStateStore = new IndexedDbAppStateStore();

        // Repositories (local-only)
        const productRepository = new SoukaiProductRepository(podBase);
        const bottleRepository = new SoukaiBottleRepository(podBase, productRepository);
        const cellarRepository = new SoukaiCellarRepository(podBase);
        this.cellarRepository = cellarRepository;
        const orderRepository = new SoukaiOrderRepository(podBase, () => this.containers.inboxContainer(), this.authService);

        // Application service
        this.kellermeisterService = new KellermeisterService(
            cellarRepository, bottleRepository, productRepository, orderRepository,
            new SoukaiBottleFactory(), new SoukaiOrderFactory(), new SoukaiProductFactory(),
        );

        // Sync layer
        this.syncService = new SolidSyncService(this.authService, podBase);
        this.syncCoordinator = new SyncCoordinator(this.authService, new SynchronizeWithPod(this.authService, this.syncService, this.appStateStore, this.kellermeisterService), this.appStateStore);
        this.reconnectSync = new ReconnectSync(this.syncCoordinator, {maxRetries: 4, baseDelayMs: 2000});
        this.pendingSync = new PendingSync(this.authService, this.appStateStore, this.reconnectSync, () => podBase() !== null);

        // Identity ownership of the local store (wipe on a WebID switch).
        this.switchIdentity = new SwitchIdentity(this.appStateStore, new IndexedDbLocalDataStore(this.containers));

        // Debug affordance: drop a file into the Pod inbox that ingestion reads.
        this.inboxUploader = new SolidInboxUploader(this.authService, () => this.containers.inboxContainer());

        // Turns bottle photos into an order (Turtle) for direct ingestion. The
        // sentinel endpoint `MOCKED` swaps in a fixed built-in order and makes
        // no network request (demo/offline affordance).
        const conversionEndpoint = import.meta.env.VITE_ORDER_CONVERSION_URL;
        this.orderConversionService = conversionEndpoint === MOCKED_CONVERSION_ENDPOINT
            ? new MockOrderConversionService()
            : new HttpOrderConversionService(conversionEndpoint);
    }

    public static getInstance(): CDI {
        if (!CDI.instance) {
            CDI.instance = new CDI();
        }
        return CDI.instance;
    }

    public getSolidService(): SolidService {
        return this.solidService;
    }

    public getAuthService(): AuthService {
        return this.authService;
    }

    public getAppStateStore(): AppStateStore {
        return this.appStateStore;
    }

    public getKellermeisterService(): KellermeisterService {
        return this.kellermeisterService;
    }

    public getCellarRepository(): CellarRepository {
        return this.cellarRepository;
    }

    public getSyncCoordinator(): SyncCoordinator {
        return this.syncCoordinator;
    }

    public getPendingSync(): PendingSync {
        return this.pendingSync;
    }

    public getSwitchIdentity(): SwitchIdentity {
        return this.switchIdentity;
    }

    public getInboxUploader(): InboxUploader {
        return this.inboxUploader;
    }

    public getOrderConversionService(): OrderConversionService {
        return this.orderConversionService;
    }

    public getPodContainerRegistry(): PodContainerRegistry {
        return this.containers;
    }

    public setPodContainerBase(base: string): void {
        this.containers.set(base);
    }
}
