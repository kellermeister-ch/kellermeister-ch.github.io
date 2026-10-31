import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KellermeisterService } from './KellermeisterService';
import { ProductFilter } from '../domain/Product/ProductFilter';
import type {CellarRepository} from "../domain/Cellar/CellarRepository.ts";
import type {Cellar} from "../domain/Cellar/Cellar.ts";
import type {BottleRepository} from "../domain/Bottle/BottleRepository.ts";
import type {ProductRepository} from "../domain/Product/ProductRepository.ts";
import type {Product} from "../domain/Product/Product.ts";
import type {ProductFactory} from "../domain/Product/ProductFactory.ts";
import type {Order} from "../domain/Order/Order.ts";
import type {Bottle} from "../domain/Bottle/Bottle.ts";
import type {OrderRepository} from "../domain/Order/OrderRepository.ts";
import type {BottleFactory} from "../domain/Bottle/BottleFactory.ts";
import type {OrderFactory} from "../domain/Order/OrderFactory.ts";
import {SoukaiProduct} from "../infrastructure/soukai/model/SoukaiProduct.ts";
import {installMemoryEngine, bootSoukaiModels} from "../testing/soukai.ts";
import {SoukaiOrder} from "../infrastructure/soukai/model/SoukaiOrder.ts";
import {SoukaiCellar} from "../infrastructure/soukai/model/SoukaiCellar.ts";

// Prevent the Inrupt imports inside KellermeisterService from failing in node
vi.mock('@inrupt/solid-client', () => ({ deleteSolidDataset: vi.fn() }));
vi.mock('@inrupt/solid-client-authn-browser', () => ({ fetch: vi.fn() }));

// Boot Soukai models once at module load so model constructors used inside
// describe-level helpers (e.g. `const cellarA = makeCellar(...)`) don't run
// before the Metadata/history models are registered.
bootSoukaiModels();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// soukai-bis validates the model `url` as a real URL (Zod `url()`), so wrap the
// opaque test ids into valid local URLs. Identity is consistent across helpers,
// so cellar/product grouping still matches.
const u = (id: string): string => `local://test/${encodeURIComponent(id)}#it`;

function makeCellar(id: string): Cellar {
    const cellar = new SoukaiCellar();
    // SoukaiCellar.getId() returns this.url
    cellar.url = u(id);
    cellar.name = "name";
    return cellar
}

function makeProduct(id: string, name?: string): Product {
    const product = new SoukaiProduct();
    product.url = u(id);
    product.name = name;
    return product;
}

function makeBottle(productId: string, cellarId: string, productName?: string): Bottle {
    const product = makeProduct(productId, productName);
    return {
        getProduct: () => product,
        getCellar: () => u(cellarId),
    } as unknown as Bottle;
}

function makeOrder(orderDate?: Date): Order {
    const order = new SoukaiOrder();
    order.orderDate = orderDate;
    return order;
}


// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function makeService() {
    const cellarRepo: CellarRepository = {
        fetchCellars: vi.fn(),
        fetchCellarById: vi.fn(),
        createCellar: vi.fn(),
        deleteCellar: vi.fn(),
        getCellarWorkId: vi.fn().mockReturnValue('cellarwork-id'),
        fetchCellarForCellarwork: vi.fn(),
        createCellarForAltglass: vi.fn(),
        createCellarForCellarwork: vi.fn(),
        ensureWellKnownCellars: vi.fn(),
        getAltglassId: vi.fn().mockReturnValue('altglass-id'),
        fetchCellarForAltglass: vi.fn(),
    };
    const bottleRepo: BottleRepository = {
        fetchBottles: vi.fn().mockResolvedValue([]),
        save: vi.fn(),
        saveAll: vi.fn(),
        delete: vi.fn(),
    };
    const productRepo: ProductRepository = {
        save: vi.fn(),
        linkOrderItem: vi.fn(),
        fetchById: vi.fn(),
    };
    const orderRepo: OrderRepository = {
        fetchOrders: vi.fn(),
        fetchUnprocessedOrders: vi.fn(),
        parseOrders: vi.fn(),
        fetchOrderById: vi.fn(),
        saveProcessedOrder: vi.fn(),
        deleteFromInbox: vi.fn(),
    };
    const bottleFactory: BottleFactory = {
        createFromProduct: vi.fn(),
    };
    const productFactory: ProductFactory = {
        createProduct: vi.fn(),
    };
    const orderFactory: OrderFactory = {
        createOrder: vi.fn(),
        createOrderItem: vi.fn(),
        linkProduct: vi.fn(),
    };
    installMemoryEngine();
    const service = new KellermeisterService(cellarRepo, bottleRepo, productRepo, orderRepo, bottleFactory, orderFactory, productFactory);
    return { service, cellarRepo, bottleRepo, productRepo, orderRepo, bottleFactory, orderFactory, productFactory };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KellermeisterService', () => {

    describe('deleteBottlesFromAltglass', () => {
        const inCellar = (cellarId: string) => ({ getCellar: () => cellarId } as unknown as Bottle);

        it('deletes every given Altglass bottle', async () => {
            const { service, bottleRepo } = makeService();
            const bottles = [inCellar('altglass-id'), inCellar('altglass-id'), inCellar('altglass-id')];

            await service.deleteBottlesFromAltglass(bottles);

            expect(bottleRepo.delete).toHaveBeenCalledTimes(3);
            bottles.forEach(bottle => expect(bottleRepo.delete).toHaveBeenCalledWith(bottle));
        });

        it('throws and deletes nothing if any bottle is not in Altglass', async () => {
            const { service, bottleRepo } = makeService();
            const bottles = [inCellar('altglass-id'), inCellar('keller-a')];

            await expect(service.deleteBottlesFromAltglass(bottles)).rejects.toThrow(/Altglass/);
            expect(bottleRepo.delete).not.toHaveBeenCalled();
        });

        it('invalidates the bottle cache so the next read refetches', async () => {
            const { service, bottleRepo } = makeService();
            await service.getAllBottles();

            await service.deleteBottlesFromAltglass([inCellar('altglass-id')]);
            await service.getAllBottles();

            expect(bottleRepo.fetchBottles).toHaveBeenCalledTimes(2);
        });
    });

    describe('addBottlesOfProduct', () => {
        function withFactory() {
            const deps = makeService();
            const cellars: string[] = [];
            const products: Product[] = [];
            vi.mocked(deps.bottleFactory.createFromProduct).mockImplementation((product: Product) => {
                products.push(product);
                return { setCellar: (c: string) => cellars.push(c) } as unknown as Bottle;
            });
            return { ...deps, cellars, products };
        }

        it('creates and saves the given number of bottles of the product in the cellar', async () => {
            const { service, bottleRepo, cellars, products } = withFactory();
            const product = makeProduct('p1', 'Agrapart 7 Crus');

            await service.addBottlesOfProduct(product, 'keller-a', 2);

            expect(products).toEqual([product, product]);
            expect(cellars).toEqual(['keller-a', 'keller-a']);
            expect(bottleRepo.saveAll).toHaveBeenCalledTimes(1);
            expect(vi.mocked(bottleRepo.saveAll).mock.calls[0][0]).toHaveLength(2);
        });

        it('does nothing for zero or a negative count', async () => {
            const { service, bottleRepo, bottleFactory } = withFactory();
            const product = makeProduct('p1');

            await service.addBottlesOfProduct(product, 'keller-a', 0);
            await service.addBottlesOfProduct(product, 'keller-a', -3);

            expect(bottleFactory.createFromProduct).not.toHaveBeenCalled();
            expect(bottleRepo.saveAll).not.toHaveBeenCalled();
        });

        it('invalidates the bottle cache so the next read refetches', async () => {
            const { service, bottleRepo } = withFactory();
            await service.getAllBottles();
            expect(bottleRepo.fetchBottles).toHaveBeenCalledTimes(1);

            await service.addBottlesOfProduct(makeProduct('p1'), 'keller-a', 1);
            await service.getAllBottles();

            expect(bottleRepo.fetchBottles).toHaveBeenCalledTimes(2);
        });
    });

    describe('bottlesFromCellarGroupedByProduct', () => {
        // Raw cellar ids so the Altglass cellar can match the mocked getAltglassId().
        const cellarWithId = (id: string) => ({ getId: () => id } as unknown as Cellar);
        const altglass = cellarWithId('altglass-id');
        const day = (n: number) => new Date(2026, 8, n);
        const drunk = (productId: string, name: string, date?: Date, cellarId = 'altglass-id') => {
            const product = makeProduct(productId, name);
            return {
                getProduct: () => product,
                getCellar: () => cellarId,
                getEffectiveDisposalDate: () => date,
            } as unknown as Bottle;
        };
        const rowNames = (grouped: Map<string, Bottle[]>) =>
            [...grouped.values()].map(bottles => bottles[0].getProduct().getName());

        it('orders Altglass rows newest disposal first', async () => {
            const { service, bottleRepo } = makeService();
            vi.mocked(bottleRepo.fetchBottles).mockResolvedValue([
                drunk('a', 'Amarone', day(1)), drunk('b', 'Barolo', day(3)), drunk('c', 'Chianti', day(2)),
            ]);

            const grouped = await service.bottlesFromCellarGroupedByProduct(altglass, new ProductFilter());

            expect(rowNames(grouped)).toEqual(['Barolo', 'Chianti', 'Amarone']);
        });

        it('uses the latest bottle of a row as its date', async () => {
            const { service, bottleRepo } = makeService();
            vi.mocked(bottleRepo.fetchBottles).mockResolvedValue([
                drunk('a', 'Amarone', day(1)), drunk('a', 'Amarone', day(5)), drunk('b', 'Barolo', day(3)),
            ]);

            const grouped = await service.bottlesFromCellarGroupedByProduct(altglass, new ProductFilter());

            expect(rowNames(grouped)).toEqual(['Amarone', 'Barolo']);
        });

        it('orders rows with equal dates by name and undated rows last', async () => {
            const { service, bottleRepo } = makeService();
            vi.mocked(bottleRepo.fetchBottles).mockResolvedValue([
                drunk('z', 'Zweigelt', undefined), drunk('c', 'chianti', day(2)),
                drunk('b', 'Barolo', day(2)), drunk('a', 'Amarone', undefined),
            ]);

            const grouped = await service.bottlesFromCellarGroupedByProduct(altglass, new ProductFilter());

            expect(rowNames(grouped)).toEqual(['Barolo', 'chianti', 'Amarone', 'Zweigelt']);
        });

        it('keeps the newest-first order when a filter is applied', async () => {
            const { service, bottleRepo } = makeService();
            vi.mocked(bottleRepo.fetchBottles).mockResolvedValue([
                drunk('a', 'Barolo Riserva', day(1)), drunk('b', 'Barolo', day(3)), drunk('c', 'Chianti', day(4)),
            ]);
            const barolo = new ProductFilter();
            barolo.isText = true;
            barolo.textFilter = 'barolo';

            const grouped = await service.bottlesFromCellarGroupedByProduct(altglass, barolo);

            expect(rowNames(grouped)).toEqual(['Barolo', 'Barolo Riserva']);
        });

        it('orders other cellars by name', async () => {
            const { service, bottleRepo } = makeService();
            vi.mocked(bottleRepo.fetchBottles).mockResolvedValue([
                drunk('b', 'Barolo', day(3), 'keller'), drunk('a', 'amarone', day(1), 'keller'),
            ]);

            const grouped = await service.bottlesFromCellarGroupedByProduct(cellarWithId('keller'), new ProductFilter());

            expect(rowNames(grouped)).toEqual(['amarone', 'Barolo']);
        });
    });

    describe('countBottles', () => {
        // Stubs with the raw cellar id, so it can equal the mocked getAltglassId().
        const inCellar = (cellarId: string | undefined) => ({ getCellar: () => cellarId } as unknown as Bottle);

        it('excludes Altglass but counts Kellerarbeit and cellar-less bottles', async () => {
            const { service, bottleRepo } = makeService();
            vi.mocked(bottleRepo.fetchBottles).mockResolvedValue([
                inCellar('keller-a'), inCellar('keller-a'), inCellar('keller-b'),
                inCellar('cellarwork-id'),
                inCellar(undefined),
                inCellar('altglass-id'), inCellar('altglass-id'),
            ]);
            expect(await service.countBottles()).toBe(5);
        });

        it('counts every bottle when none is in Altglass', async () => {
            const { service, bottleRepo } = makeService();
            vi.mocked(bottleRepo.fetchBottles).mockResolvedValue([inCellar('keller-a'), inCellar('keller-b')]);
            expect(await service.countBottles()).toBe(2);
        });

        it('returns zero when there are no bottles', async () => {
            const { service } = makeService();
            expect(await service.countBottles()).toBe(0);
        });
    });

    describe('getAltglassId / getCellarWorkId', () => {
        it('delegates getAltglassId to the cellar repository', () => {
            const { service } = makeService();
            expect(service.getAltglassId()).toBe('altglass-id');
        });

        it('delegates getCellarWorkId to the cellar repository', () => {
            const { service } = makeService();
            expect(service.getCellarWorkId()).toBe('cellarwork-id');
        });
    });

    // -----------------------------------------------------------------------
    // productComparator
    // -----------------------------------------------------------------------

    describe('productComparator', () => {
        let service: KellermeisterService;

        beforeEach(() => {
            ({ service } = makeService());
        });

        it('returns negative when a.name comes before b.name alphabetically', () => {
            expect(service.productComparator(makeProduct('1', 'Bordeaux'), makeProduct('2', 'Chardonnay'))).toBeLessThan(0);
        });

        it('returns positive when a.name comes after b.name alphabetically', () => {
            expect(service.productComparator(makeProduct('1', 'Zinfandel'), makeProduct('2', 'Merlot'))).toBeGreaterThan(0);
        });

        it('returns 0 when both names are equal', () => {
            expect(service.productComparator(makeProduct('1', 'Merlot'), makeProduct('2', 'Merlot'))).toBe(0);
        });

        it('returns -1 when b.name is undefined', () => {
            expect(service.productComparator(makeProduct('1', 'Merlot'), makeProduct('2', undefined))).toBe(-1);
        });

        it('returns 1 when a.name is undefined', () => {
            expect(service.productComparator(makeProduct('1', undefined), makeProduct('2', 'Merlot'))).toBe(1);
        });
    });

    // -----------------------------------------------------------------------
    // getAllCellars / getCellarById / createCellar
    // -----------------------------------------------------------------------

    describe('cellar delegation', () => {
        it('getAllCellars delegates to the repository', async () => {
            const { service, cellarRepo } = makeService();
            const cellars = [makeCellar('c1'), makeCellar('c2')];
            vi.mocked(cellarRepo.fetchCellars).mockResolvedValue(cellars);
            expect(await service.getAllCellars()).toEqual(cellars);
        });

        it('getCellarById delegates to the repository', async () => {
            const { service, cellarRepo } = makeService();
            const cellar = makeCellar('c1');
            vi.mocked(cellarRepo.fetchCellars).mockResolvedValue([cellar]);
            expect(await service.getCellarById(u('c1'))).toEqual(cellar);
        });

        it('createCellar delegates to the repository', async () => {
            const { service, cellarRepo } = makeService();
            const newCellar = makeCellar('new-id');
            vi.mocked(cellarRepo.createCellar).mockResolvedValue(newCellar);
            expect(await service.createCellar('Neuer Keller')).toEqual(newCellar);
            expect(cellarRepo.createCellar).toHaveBeenCalledWith('Neuer Keller');
        });
    });

    // -----------------------------------------------------------------------
    // cellar caching
    // -----------------------------------------------------------------------

    describe('cellar caching', () => {
        it('getAllCellars fetches from repository only once and caches on subsequent calls', async () => {
            const { service, cellarRepo } = makeService();
            const cellars = [makeCellar('c1'), makeCellar('c2')];
            vi.mocked(cellarRepo.fetchCellars).mockResolvedValue(cellars);

            await service.getAllVisibleCellars();
            await service.getAllVisibleCellars();

            expect(cellarRepo.fetchCellars).toHaveBeenCalledOnce();
        });

        it('getCellarById returns the matching cellar from cache without re-fetching', async () => {
            const { service, cellarRepo } = makeService();
            const c1 = makeCellar('c1');
            const c2 = makeCellar('c2');
            vi.mocked(cellarRepo.fetchCellars).mockResolvedValue([c1, c2]);

            expect(await service.getCellarById(u('c1'))).toBe(c1);
            expect(await service.getCellarById(u('c2'))).toBe(c2);
            expect(cellarRepo.fetchCellars).toHaveBeenCalledOnce();
        });

        it('getCellarById returns null when id is not found', async () => {
            const { service, cellarRepo } = makeService();
            vi.mocked(cellarRepo.fetchCellars).mockResolvedValue([makeCellar('c1')]);
            expect(await service.getCellarById('unknown')).toBeNull();
        });

        it('createCellar invalidates the cache so the next getAllCellars re-fetches', async () => {
            const { service, cellarRepo } = makeService();
            vi.mocked(cellarRepo.fetchCellars).mockResolvedValue([makeCellar('c1')]);
            vi.mocked(cellarRepo.createCellar).mockResolvedValue(makeCellar('c2'));

            await service.getAllVisibleCellars();
            await service.createCellar('Neuer Keller');
            await service.getAllVisibleCellars();

            expect(cellarRepo.fetchCellars).toHaveBeenCalledTimes(2);
        });

        it('removeCellar invalidates the cache when the cellar is empty and gets deleted', async () => {
            const { service, cellarRepo, bottleRepo } = makeService();
            const cellar = makeCellar('c1');
            vi.mocked(cellarRepo.fetchCellars).mockResolvedValue([cellar]);
            vi.mocked(bottleRepo.fetchBottles).mockResolvedValue([]);

            await service.getAllVisibleCellars();
            await service.removeCellar(cellar);
            await service.getAllVisibleCellars();

            expect(cellarRepo.fetchCellars).toHaveBeenCalledTimes(2);
        });

        it('removeCellar does NOT invalidate the cache when the cellar is not empty', async () => {
            const { service, cellarRepo, bottleRepo } = makeService();
            const cellar = makeCellar('c1');
            vi.mocked(cellarRepo.fetchCellars).mockResolvedValue([cellar]);
            vi.mocked(bottleRepo.fetchBottles).mockResolvedValue([makeBottle('p1', 'c1', 'Merlot')]);

            await service.getAllVisibleCellars();
            await service.removeCellar(cellar);
            await service.getAllVisibleCellars();

            expect(cellarRepo.fetchCellars).toHaveBeenCalledOnce();
        });
    });

    // -----------------------------------------------------------------------
    // invalidate (called after a sync)
    // -----------------------------------------------------------------------

    describe('invalidate', () => {
        it('drops the cellar, bottle and order caches so the next reads re-fetch', async () => {
            const { service, cellarRepo, bottleRepo, orderRepo } = makeService();
            vi.mocked(cellarRepo.fetchCellars).mockResolvedValue([makeCellar('c1')]);
            vi.mocked(bottleRepo.fetchBottles).mockResolvedValue([makeBottle('p1', 'c1')]);
            vi.mocked(orderRepo.fetchOrders).mockResolvedValue([makeOrder(new Date(2024, 0, 1))]);

            await service.getAllCellars();
            await service.getAllBottles();
            await service.getAllOrders();

            service.invalidate();

            await service.getAllCellars();
            await service.getAllBottles();
            await service.getAllOrders();

            expect(cellarRepo.fetchCellars).toHaveBeenCalledTimes(2);
            expect(bottleRepo.fetchBottles).toHaveBeenCalledTimes(2);
            expect(orderRepo.fetchOrders).toHaveBeenCalledTimes(2);
        });
    });

    // -----------------------------------------------------------------------
    // getAllOrders
    // -----------------------------------------------------------------------

    describe('getAllOrders', () => {
        it('delegates to the order repository', async () => {
            const { service, orderRepo } = makeService();
            const orders = [makeOrder(new Date(2024, 0, 1))];
            vi.mocked(orderRepo.fetchOrders).mockResolvedValue(orders);
            expect(await service.getAllOrders()).toEqual(orders);
        });
    });

    // -----------------------------------------------------------------------
    // ordersGroupedByMonth
    // -----------------------------------------------------------------------

    describe('ordersGroupedByMonth', () => {
        let service: KellermeisterService;
        let orderRepo: OrderRepository;

        beforeEach(() => {
            ({ service, orderRepo } = makeService());
        });

        it('groups orders in the same month under a single key', async () => {
            const jan1 = makeOrder(new Date(2024, 0, 5));
            const jan2 = makeOrder(new Date(2024, 0, 20));
            vi.mocked(orderRepo.fetchOrders).mockResolvedValue([jan1, jan2]);

            const grouped = await service.ordersGroupedByMonth(new ProductFilter());
            expect(grouped.size).toBe(1);
            const [, orders] = [...grouped.entries()][0];
            expect(orders).toHaveLength(2);
        });

        it('separates orders from different months', async () => {
            const jan = makeOrder(new Date(2024, 0, 10));
            const feb = makeOrder(new Date(2024, 1, 10));
            const mar = makeOrder(new Date(2024, 2, 10));
            vi.mocked(orderRepo.fetchOrders).mockResolvedValue([jan, feb, mar]);

            const grouped = await service.ordersGroupedByMonth(new ProductFilter());
            expect(grouped.size).toBe(3);
        });

        it('sorts months in descending order (newest first)', async () => {
            const jan = makeOrder(new Date(2024, 0, 1));
            const dec = makeOrder(new Date(2023, 11, 1));
            const jun = makeOrder(new Date(2024, 5, 1));
            vi.mocked(orderRepo.fetchOrders).mockResolvedValue([jan, dec, jun]);

            const keys = [...(await service.ordersGroupedByMonth(new ProductFilter())).keys()];
            expect(keys[0].getFullYear()).toBe(2024);
            expect(keys[0].getMonth()).toBe(5); // June
            expect(keys[1].getFullYear()).toBe(2024);
            expect(keys[1].getMonth()).toBe(0); // January
            expect(keys[2].getFullYear()).toBe(2023);
            expect(keys[2].getMonth()).toBe(11); // December
        });

        it('sorts orders within a month in descending order (newest first)', async () => {
            const oct3 = makeOrder(new Date(2026, 9, 3));
            const oct28 = makeOrder(new Date(2026, 9, 28));
            const oct15 = makeOrder(new Date(2026, 9, 15));
            vi.mocked(orderRepo.fetchOrders).mockResolvedValue([oct3, oct28, oct15]);

            const [orders] = [...(await service.ordersGroupedByMonth(new ProductFilter())).values()];
            expect(orders).toEqual([oct28, oct15, oct3]);
        });

        it('keeps the relative order of orders with the same date', async () => {
            const first = makeOrder(new Date(2026, 9, 10));
            const second = makeOrder(new Date(2026, 9, 10));
            const newer = makeOrder(new Date(2026, 9, 20));
            vi.mocked(orderRepo.fetchOrders).mockResolvedValue([first, second, newer]);

            const [orders] = [...(await service.ordersGroupedByMonth(new ProductFilter())).values()];
            expect(orders[0]).toBe(newer);
            expect(orders[1]).toBe(first);
            expect(orders[2]).toBe(second);
        });

        it('groups orders with no date under a single unknown-date key (1900-01-01)', async () => {
            const o1 = makeOrder(undefined);
            const o2 = makeOrder(undefined);
            vi.mocked(orderRepo.fetchOrders).mockResolvedValue([o1, o2]);

            const grouped = await service.ordersGroupedByMonth(new ProductFilter());
            expect(grouped.size).toBe(1);
            const [key] = [...grouped.keys()];
            expect(key.getFullYear()).toBe(1900);
        });

        it('uses the same Date instance as key for orders in the same month', async () => {
            const o1 = makeOrder(new Date(2024, 3, 1));
            const o2 = makeOrder(new Date(2024, 3, 30));
            vi.mocked(orderRepo.fetchOrders).mockResolvedValue([o1, o2]);

            const grouped = await service.ordersGroupedByMonth(new ProductFilter());
            const keys = [...grouped.keys()];
            expect(keys).toHaveLength(1);
            expect(keys[0].getDate()).toBe(1); // normalised to 1st of month
        });
    });

    // -----------------------------------------------------------------------
    // bottlesFromCellarGroupedByProduct
    // -----------------------------------------------------------------------

    describe('bottlesFromCellarGroupedByProduct', () => {
        let service: KellermeisterService;
        const cellarA = makeCellar('cellar-a');

        beforeEach(() => {
            ({ service } = makeService());
        });

        function injectBottles(svc: KellermeisterService, bottles: Bottle[]) {
            (svc as any).cachedBottles = bottles;
        }

        it('returns an empty map when there are no bottles', async () => {
            injectBottles(service, []);
            const result = await service.bottlesFromCellarGroupedByProduct(cellarA, new ProductFilter());
            expect(result.size).toBe(0);
        });

        it('groups bottles by product id', async () => {
            injectBottles(service, [
                makeBottle('p1', 'cellar-a', 'Merlot'),
                makeBottle('p1', 'cellar-a', 'Merlot'),
                makeBottle('p2', 'cellar-a', 'Chardonnay'),
            ]);
            const result = await service.bottlesFromCellarGroupedByProduct(cellarA, new ProductFilter());
            expect(result.size).toBe(2);
            expect(result.get(u('p1'))).toHaveLength(2);
            expect(result.get(u('p2'))).toHaveLength(1);
        });

        it('shows products with the same name but different ids as separate groups', async () => {
            // Two orders of the same wine mint two product resources with equal
            // names; they must not be merged into one row.
            injectBottles(service, [
                makeBottle('p1', 'cellar-a', 'Merlot'),
                makeBottle('p1', 'cellar-a', 'Merlot'),
                makeBottle('p2', 'cellar-a', 'Merlot'),
            ]);
            const result = await service.bottlesFromCellarGroupedByProduct(cellarA, new ProductFilter());
            expect(result.size).toBe(2);
            expect(result.get(u('p1'))).toHaveLength(2);
            expect(result.get(u('p2'))).toHaveLength(1);
        });

        it('orders groups by product name, keeping identically-named products adjacent', async () => {
            injectBottles(service, [
                makeBottle('p-z', 'cellar-a', 'Zinfandel'),
                makeBottle('p-m2', 'cellar-a', 'Merlot'),
                makeBottle('p-a', 'cellar-a', 'Aligoté'),
                makeBottle('p-m1', 'cellar-a', 'Merlot'),
            ]);
            const result = await service.bottlesFromCellarGroupedByProduct(cellarA, new ProductFilter());
            const names = [...result.values()].map((group) => group[0].getProduct().getName());
            expect(names).toEqual(['Aligoté', 'Merlot', 'Merlot', 'Zinfandel']);
        });

        it('excludes bottles from other cellars', async () => {
            injectBottles(service, [
                makeBottle('p1', 'cellar-a', 'Merlot'),
                makeBottle('p2', 'cellar-b', 'Chardonnay'),
            ]);
            const result = await service.bottlesFromCellarGroupedByProduct(cellarA, new ProductFilter());
            expect(result.size).toBe(1);
            expect(result.has(u('p1'))).toBe(true);
        });

        it('excludes bottles that do not pass the filter', async () => {
            const filter = new ProductFilter();
            filter.isText = true;
            filter.textFilter = 'Merlot';
            injectBottles(service, [
                makeBottle('p1', 'cellar-a', 'Merlot'),
                makeBottle('p2', 'cellar-a', 'Chardonnay'),
            ]);
            const result = await service.bottlesFromCellarGroupedByProduct(cellarA, filter);
            expect(result.has(u('p1'))).toBe(true);
            expect(result.has(u('p2'))).toBe(false);
        });

        it('returns an empty map when cellar is undefined', async () => {
            injectBottles(service, [makeBottle('p1', 'cellar-a', 'Merlot')]);
            const result = await service.bottlesFromCellarGroupedByProduct(undefined, new ProductFilter());
            expect(result.size).toBe(0);
        });

        it('fetches bottles from the repository when the cache is empty', async () => {
            const { service: svc, bottleRepo } = makeService();
            const bottles = [makeBottle('p1', 'cellar-a', 'Merlot')];
            vi.mocked(bottleRepo.fetchBottles).mockResolvedValue(bottles);
            const result = await svc.bottlesFromCellarGroupedByProduct(cellarA, new ProductFilter());
            expect(bottleRepo.fetchBottles).toHaveBeenCalledOnce();
            expect(result.size).toBe(1);
        });

        it('uses the cached bottles on a second call', async () => {
            const { service: svc, bottleRepo } = makeService();
            const bottles = [makeBottle('p1', 'cellar-a', 'Merlot')];
            vi.mocked(bottleRepo.fetchBottles).mockResolvedValue(bottles);
            await svc.bottlesFromCellarGroupedByProduct(cellarA, new ProductFilter());
            await svc.bottlesFromCellarGroupedByProduct(cellarA, new ProductFilter());
            expect(bottleRepo.fetchBottles).toHaveBeenCalledOnce();
        });
    });

    // -----------------------------------------------------------------------
    // ingestOrder / explode
    // -----------------------------------------------------------------------

    describe('ingestOrder', () => {
        // it('skips order items with orderQuantity 0', async () => {
        //     const { service, bottleFactory } = makeService();
        //     const product = makeProduct('p1', 'Riesling');
        //     const orderItem = { orderQuantity: 0, product } as any;
        //     const order = { positions: [orderItem] } as unknown as Order;
        //
        //     const addBottle = vi.fn();
        //     const container = { products: vi.fn().mockReturnValue([]), addBottle } as unknown as BottlesContainer;
        //
        //     await service.ingestOrder(order, 'cellar-a', container);
        //
        //     expect(bottleFactory.createFromProduct).not.toHaveBeenCalled();
        //     expect(addBottle).not.toHaveBeenCalled();
        // });

        it('does nothing when the order has no positions', async () => {
            const { service, bottleFactory, orderFactory, orderRepo } = makeService();
            const order = { getOrderItems: () => undefined } as unknown as Order;
            const builtOrder = { getId: () => 'order-x', getOrderItems: () => [] } as unknown as Order;
            vi.mocked(orderFactory.createOrder).mockReturnValue(builtOrder);

            await service.ingestOrder(order, 'cellar-a');

            expect(bottleFactory.createFromProduct).not.toHaveBeenCalled();
            // The freshly-built order is still persisted and the source cleared.
            expect(orderRepo.saveProcessedOrder).toHaveBeenCalledWith(builtOrder);
            expect(orderRepo.deleteFromInbox).toHaveBeenCalledWith(order);
        });

        it('creates a product and one bottle per ordered unit in the cellarwork cellar', async () => {
            const { service, orderFactory, productFactory, bottleFactory, productRepo, bottleRepo } = makeService();

            const product = makeProduct('p1', 'Barolo');
            const orderItem = { getOrderQuantity: () => 3, getProduct: () => product } as unknown as Order;
            const order = { getOrderItems: () => [orderItem] } as unknown as Order;

            const newOrderItem = { id: 'oi1' } as unknown as Order;
            const newOrder = { addOrderItem: vi.fn() } as unknown as Order;
            vi.mocked(orderFactory.createOrder).mockReturnValue(newOrder);
            vi.mocked(orderFactory.createOrderItem).mockReturnValue(newOrderItem as never);
            vi.mocked(productFactory.createProduct).mockReturnValue(product);
            vi.mocked(productRepo.save).mockResolvedValue(product);
            const placedCellars: string[] = [];
            vi.mocked(bottleFactory.createFromProduct).mockImplementation(
                () => ({ setCellar: (c: string) => placedCellars.push(c) } as unknown as Bottle),
            );

            const returned = await service.addBottles(order, 'cellarwork-id');

            expect(returned).toBe(newOrder);
            expect(productRepo.save).toHaveBeenCalledWith(product);
            expect(orderFactory.linkProduct).toHaveBeenCalledWith(newOrderItem, product);
            expect(bottleFactory.createFromProduct).toHaveBeenCalledTimes(3);
            expect(bottleRepo.saveAll).toHaveBeenCalledTimes(1);
            const savedBottles = vi.mocked(bottleRepo.saveAll).mock.calls[0][0];
            expect(savedBottles).toHaveLength(3);
            expect(placedCellars).toEqual(['cellarwork-id', 'cellarwork-id', 'cellarwork-id']);
        });
    });

    // -----------------------------------------------------------------------
    // ingestOrdersFromInbox — batch, single-flight, atomic failure
    // -----------------------------------------------------------------------

    describe('ingestOrdersFromInbox', () => {
        // Wire the factory/repos so each order ingests as a no-position order:
        // createOrder echoes a distinct built order, save/delete are recorded.
        function wireBatch(deps: ReturnType<typeof makeService>, orders: Order[]) {
            const { cellarRepo, orderRepo, orderFactory } = deps;
            const cellarwork = makeCellar('cellarwork-id');
            vi.mocked(cellarRepo.fetchCellarForCellarwork).mockResolvedValue(cellarwork);
            vi.mocked(orderRepo.fetchUnprocessedOrders).mockResolvedValue(orders);
            // Each order has no positions, so addBottles just returns the built order.
            const built = new Map<Order, Order>();
            vi.mocked(orderFactory.createOrder).mockImplementation((source: Order) => {
                const b = { getId: () => `built-${source.getId?.() ?? ''}`, getOrderItems: () => [] } as unknown as Order;
                built.set(source, b);
                return b;
            });
            vi.mocked(orderRepo.saveProcessedOrder).mockImplementation(async (o: Order) => o);
            return { cellarwork, built };
        }

        function makeInboxOrder(id: string): Order {
            return { getId: () => id, getOrderItems: () => [] } as unknown as Order;
        }

        it('processes the whole batch and deletes every order document from the inbox', async () => {
            const deps = makeService();
            const orders = [makeInboxOrder('o1'), makeInboxOrder('o2'), makeInboxOrder('o3')];
            wireBatch(deps, orders);

            const cellar = await deps.service.ingestOrdersFromInbox();

            expect(cellar.getId()).toBe(u('cellarwork-id'));
            expect(deps.orderRepo.saveProcessedOrder).toHaveBeenCalledTimes(3);
            expect(deps.orderRepo.deleteFromInbox).toHaveBeenCalledTimes(3);
            // Each source order (not the built order) is the delete target.
            const deleted = vi.mocked(deps.orderRepo.deleteFromInbox).mock.calls.map(c => c[0]);
            expect(deleted).toEqual(orders);
        });

        it('is single-flight: overlapping calls coalesce into one batch', async () => {
            const deps = makeService();
            const orders = [makeInboxOrder('o1'), makeInboxOrder('o2')];
            wireBatch(deps, orders);

            // Fire two calls before the first settles; they must share one run.
            const [c1, c2] = await Promise.all([
                deps.service.ingestOrdersFromInbox(),
                deps.service.ingestOrdersFromInbox(),
            ]);

            expect(c1).toBe(c2);
            expect(deps.cellarRepo.fetchCellarForCellarwork).toHaveBeenCalledOnce();
            expect(deps.orderRepo.fetchUnprocessedOrders).toHaveBeenCalledOnce();
            // Each order processed and deleted exactly once (no doubling).
            expect(deps.orderRepo.deleteFromInbox).toHaveBeenCalledTimes(2);
        });

        it('clears the in-flight guard so a later call re-reads the inbox', async () => {
            const deps = makeService();
            wireBatch(deps, [makeInboxOrder('o1')]);

            await deps.service.ingestOrdersFromInbox();
            await deps.service.ingestOrdersFromInbox();

            expect(deps.orderRepo.fetchUnprocessedOrders).toHaveBeenCalledTimes(2);
        });

        it('on a mid-batch failure: keeps processed orders saved, leaves later documents in the inbox, and rejects', async () => {
            const deps = makeService();
            const orders = [makeInboxOrder('o1'), makeInboxOrder('o2'), makeInboxOrder('o3')];
            wireBatch(deps, orders);
            // The second order fails to persist; the loop must not continue.
            vi.mocked(deps.orderRepo.saveProcessedOrder).mockImplementation(async (o: Order) => {
                if (o.getId() === 'built-o2') {
                    throw new Error('save failed');
                }
                return o;
            });

            await expect(deps.service.ingestOrdersFromInbox()).rejects.toThrow('save failed');

            // o1 fully processed (saved + inbox document deleted).
            expect(deps.orderRepo.deleteFromInbox).toHaveBeenCalledTimes(1);
            expect(vi.mocked(deps.orderRepo.deleteFromInbox).mock.calls[0][0]).toBe(orders[0]);
            // o2's document is NOT deleted (save failed before delete); o3 untouched.
            const deletedIds = vi.mocked(deps.orderRepo.deleteFromInbox).mock.calls.map(c => c[0].getId());
            expect(deletedIds).not.toContain('o2');
            expect(deletedIds).not.toContain('o3');
            // The guard is cleared, so a retry re-reads the (still-populated) inbox.
            wireBatch(deps, [orders[1], orders[2]]);
            await deps.service.ingestOrdersFromInbox();
            expect(deps.orderRepo.fetchUnprocessedOrders).toHaveBeenCalledTimes(2);
        });
    });

    // -----------------------------------------------------------------------
    // ingestOrderFromTurtle — direct ingestion of a converted order
    // -----------------------------------------------------------------------

    describe('ingestOrderFromTurtle', () => {

        it('creates a product and one bottle per ordered unit in cellarwork and saves the order locally', async () => {
            const deps = makeService();
            const { service, cellarRepo, orderRepo, orderFactory, productFactory, bottleFactory, productRepo, bottleRepo } = deps;

            vi.mocked(cellarRepo.fetchCellarForCellarwork).mockResolvedValue(makeCellar('cellarwork-id'));
            const product = makeProduct('p1', 'Barolo');
            const orderItem = { getOrderQuantity: () => 3, getProduct: () => product } as unknown as Order;
            const parsedOrder = { getOrderItems: () => [orderItem] } as unknown as Order;
            vi.mocked(orderRepo.parseOrders).mockResolvedValue([parsedOrder]);

            const builtItems: Array<{ getProduct: () => Product }> = [];
            const newOrder = {
                addOrderItem: (it: { getProduct: () => Product }) => builtItems.push(it),
                getId: () => 'built-order',
                getOrderItems: () => builtItems,
            } as unknown as Order;
            const newOrderItem = { getProduct: () => product } as unknown as Order;
            vi.mocked(orderFactory.createOrder).mockReturnValue(newOrder);
            vi.mocked(orderFactory.createOrderItem).mockReturnValue(newOrderItem as never);
            vi.mocked(productFactory.createProduct).mockReturnValue(product);
            vi.mocked(productRepo.save).mockResolvedValue(product);
            const placedCellars: string[] = [];
            vi.mocked(bottleFactory.createFromProduct).mockImplementation(
                () => ({ setCellar: (c: string) => placedCellars.push(c) } as unknown as Bottle),
            );
            vi.mocked(orderRepo.saveProcessedOrder).mockImplementation(async (o: Order) => o);

            const cellar = await service.ingestOrderFromTurtle('@prefix schema: <https://schema.org/> . # ...');

            expect(cellar.getId()).toBe(u('cellarwork-id'));
            expect(productRepo.save).toHaveBeenCalledWith(product);
            // The product is back-linked to its order item after the order is saved.
            expect(productRepo.linkOrderItem).toHaveBeenCalledWith(product, newOrderItem);
            expect(bottleFactory.createFromProduct).toHaveBeenCalledTimes(3);
            const savedBottles = vi.mocked(bottleRepo.saveAll).mock.calls[0][0];
            expect(savedBottles).toHaveLength(3);
            expect(placedCellars).toEqual([u('cellarwork-id'), u('cellarwork-id'), u('cellarwork-id')]);
            // The freshly-built order is stored locally (re-homed on the next sync).
            expect(orderRepo.saveProcessedOrder).toHaveBeenCalledWith(newOrder);
        });

        it('rejects and creates no bottles when the Turtle yields no order', async () => {
            const deps = makeService();
            const { service, cellarRepo, orderRepo, bottleRepo } = deps;
            vi.mocked(cellarRepo.fetchCellarForCellarwork).mockResolvedValue(makeCellar('cellarwork-id'));
            vi.mocked(orderRepo.parseOrders).mockResolvedValue([]);

            await expect(service.ingestOrderFromTurtle('nonsense')).rejects.toThrow();

            expect(bottleRepo.saveAll).not.toHaveBeenCalled();
            expect(orderRepo.saveProcessedOrder).not.toHaveBeenCalled();
        });
    });
});
