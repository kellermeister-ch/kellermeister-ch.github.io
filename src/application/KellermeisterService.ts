import {ProductFilter} from "../domain/Product/ProductFilter.ts";
import type {BottleRepository} from "../domain/Bottle/BottleRepository.ts";
import type {ProductRepository} from "../domain/Product/ProductRepository.ts";
import type {Bottle} from "../domain/Bottle/Bottle.ts";
import type {Product} from "../domain/Product/Product.ts";
import type {CellarRepository} from "../domain/Cellar/CellarRepository.ts";
import type {Cellar} from "../domain/Cellar/Cellar.ts";
import type {BottleFactory} from "../domain/Bottle/BottleFactory.ts";
import type {ProductFactory} from "../domain/Product/ProductFactory.ts";
import type {OrderFactory} from "../domain/Order/OrderFactory.ts";
import type {Order} from "../domain/Order/Order.ts";
import type {OrderRepository} from "../domain/Order/OrderRepository.ts";
import type {ReadModelCache} from "./ports/ReadModelCache.ts";

/**
 * Application Use Case: Get Profile
 * Retrieves the Solid profile for a given WebID
 */
export class KellermeisterService implements ReadModelCache {

    private cachedBottles: Bottle[] | null = null;
    private cachedCellars: Cellar[] | null = null;
    private cachedOrders: Order[] | null = null;

    /**
     * In-flight inbox ingestion, if any. Ingestion is single-flight: overlapping
     * triggers (a second cellarwork open, a filter re-run) await this promise
     * instead of starting a concurrent batch. A concurrent inbox read would
     * otherwise interleave with an in-flight batch's reads/deletes and could
     * strand documents or duplicate bottles.
     */
    private ingestionInFlight: Promise<Cellar> | null = null;

    constructor(private cellarRepository: CellarRepository, private bottleRepository: BottleRepository, private productRepository: ProductRepository, private orderRespository: OrderRepository, private bottleFactory: BottleFactory, private orderFactory: OrderFactory, private productFactory: ProductFactory) {
    }

    /**
     * Drop every cached read model, so the next read goes back to the
     * repositories. Called after a sync, which changes the local store behind
     * the caches' back.
     */
    invalidate(): void {
        this.cachedBottles = null;
        this.cachedCellars = null;
        this.cachedOrders = null;
    }

    getAltglassId(): string {
        return this.cellarRepository.getAltglassId();
    }

    async getCellarAltglass(): Promise<Cellar | null> {
        return await this.getCellarById(this.getAltglassId())
    }

    getCellarWorkId(): string {
        return this.cellarRepository.getCellarWorkId();
    }

    async getCellarCellarWork(): Promise<Cellar | null> {
        return await this.getCellarById(this.getCellarWorkId());
    }

    async getAllBottles(): Promise<Bottle[]> {
        if (this.cachedBottles) {
            return this.cachedBottles;
        }
        this.cachedBottles = await this.bottleRepository.fetchBottles();
        return this.cachedBottles;
    }

    /** Number of bottles in all cellars except the Altglass cellar. */
    async countBottles(): Promise<number> {
        const bottles = await this.getAllBottles();
        const altglassId = this.getAltglassId();
        return bottles.filter(bottle => bottle.getCellar() !== altglassId).length;
    }

    /**
     * Returns a map with the product.id as key and an array of bottles as value.
     */
    async searchBottlesGroupedByCellar(filter: ProductFilter): Promise<Map<Cellar, Map<string, Bottle[]>>> {
        const [bottles, cellars] = await Promise.all([this.getAllBottles(), this.getAllCellars()]);
        const cellarMap = new Map<string, Cellar>(cellars.map(c => [c.getId(), c]));
        const grouped = new Map<string, Map<string, Bottle[]>>();

        for (const bottle of bottles) {
            if (bottle.getProduct() && bottle.getCellar() && filter.filterProduct(bottle.getProduct())) {
                if (!grouped.has(bottle.getCellar())) {
                    grouped.set(bottle.getCellar(), new Map());
                }
                const byProduct = grouped.get(bottle.getCellar())!;
                if (!byProduct.has(bottle.getProduct().getId())) {
                    byProduct.set(bottle.getProduct().getId(), []);
                }
                byProduct.get(bottle.getProduct().getId())!.push(bottle);
            }
        }

        const result = new Map<Cellar, Map<string, Bottle[]>>();
        const toSortKey = (c: Cellar) => {
            const d = c.getDisplayOrder() ?? 0;
            return d < 0 ? Number.MAX_SAFE_INTEGER : d;
        };
        const sortedCellarIds = [...grouped.keys()].sort((a, b) => {
            const ca = cellarMap.get(a);
            const cb = cellarMap.get(b);
            if (!ca || !cb) return 0;
            const orderDiff = toSortKey(ca) - toSortKey(cb);
            if (orderDiff !== 0) return orderDiff;
            return (ca.getName() ?? '').localeCompare(cb.getName() ?? '');
        });
        for (const cellarId of sortedCellarIds) {
            const cellar = cellarMap.get(cellarId);
            if (cellar) {
                const byProduct = grouped.get(cellarId)!;
                const sortedByProduct = new Map(
                    [...byProduct.entries()].sort(([, a], [, b]) =>
                        (a[0].getProduct().getName() ?? '').toLowerCase()
                            .localeCompare((b[0].getProduct().getName() ?? '').toLowerCase())
                    )
                );
                result.set(cellar, sortedByProduct);
            }
        }
        return result;
    }

    async bottlesFromCellarGroupedByProduct(cellar: Cellar | undefined, filter: ProductFilter): Promise<Map<string, Bottle[]>> {
        const bottles = await this.getAllBottles();
        const grouped = new Map<string, Bottle[]>();

        for (const bottle of bottles) {
            if (bottle.getProduct() && this.isBottleInThisCellar(bottle, cellar) && filter.filterProduct(bottle.getProduct())) {
                // Group by product id (not name): the app mints a distinct product
                // resource per order item, so two orders of the same wine are two
                // products with equal names — they must stay separate rows.
                const productId = bottle.getProduct().getId();
                if (!grouped.has(productId)) {
                    grouped.set(productId, []);
                }
                grouped.get(productId)?.push(bottle);
            }
        }
        // Altglass shows the most recently drunk wines first; every other cellar
        // orders rows by product name so identically-named products stay adjacent.
        const comparator = cellar?.getId() === this.getAltglassId()
            ? (a: Bottle[], b: Bottle[]) => this.compareRowsByLatestDisposal(a, b)
            : (a: Bottle[], b: Bottle[]) => this.compareRowsByName(a, b);
        return new Map([...grouped.entries()].sort(([, a], [, b]) => comparator(a, b)));
    }

    /**
     * Returns a map with the product.id as key and an array of bottles as value.
     */
    async bottlesFromCellar(cellar: Cellar | undefined, filter: ProductFilter): Promise<Bottle[]> {
        const bottles = await this.getAllBottles();
        return bottles.filter(bottle => cellar?.getId() === bottle.getCellar()).filter(bottle => filter.filterProduct(bottle.getProduct()))
            .sort((a: Bottle, b: Bottle) => this.productComparator(a.getProduct(), b.getProduct()));
    }

    /**
     * Returns the total number of bottles in a cellar, unaffected by any product
     * filter — this is the cellar's size, not the size of a filtered listing.
     */
    async bottleCountInCellar(cellar: Cellar | undefined): Promise<number> {
        if (!cellar) {
            return 0;
        }
        const bottles = await this.getAllBottles();
        return bottles.filter(bottle => this.isBottleInThisCellar(bottle, cellar)).length;
    }

    productComparator(a: Product, b: Product): number {
        const nameA = a.getName();
        const nameB = b.getName();
        if (nameB === undefined) {
            return -1
        }
        if (nameA === undefined) {
            return 1;
        }
        if (nameA < nameB) {
            return -1;
        }
        if (nameA > nameB) {
            return 1;
        }
        // names must be equal
        return 0;
    }

    async getAllCellars(): Promise<Cellar[]> {
        if (this.cachedCellars) {
            return this.cachedCellars;
        }
        this.cachedCellars = await this.cellarRepository.fetchCellars();
        return this.cachedCellars;
    }

    async getAllVisibleCellars(): Promise<Cellar[]> {
        const cellars = await this.getAllCellars();
        return cellars.filter(cellar => this.isVisible(cellar));
    }

    async getCellars(): Promise<Cellar[]> {
        var cellars: Cellar[] = await this.getAllVisibleCellars();
        const cellarWork = await this.getCellarCellarWork();
        if (cellarWork) {
            cellars.push(cellarWork);
        }
        const cellarAltglas = await this.getCellarAltglass();
        if (cellarAltglas) {
            cellars.push(cellarAltglas);
        }
        return cellars;
    }

    isVisible(cellar: Cellar): boolean {
        if (cellar.getDisplayOrder()) {
            return cellar.getDisplayOrder() > 0;
        }
        return true;
    }

    async getCellarById(cellarId: string): Promise<Cellar | null> {
        if (this.cachedCellars) {
            return this.cachedCellars.find(cellar => cellar.getId() === cellarId) ?? null;
        }
        this.cachedCellars = await this.cellarRepository.fetchCellars();
        return this.cachedCellars.find(cellar => cellar.getId() === cellarId) ?? null;
    }

    async createCellar(name: string): Promise<Cellar> {
        const cellar = await this.cellarRepository.createCellar(name);
        this.cachedCellars = null;
        return cellar;
    }

    async removeCellar(cellar: Cellar | undefined): Promise<void> {
        if (cellar) {
            if (await this.isEmpty(cellar)) {
                await this.cellarRepository.deleteCellar(cellar);
                this.cachedCellars = null;
            }
        }
    }

    /** True when the cellar holds no bottles (safe to delete). */
    async isCellarEmpty(cellar: Cellar): Promise<boolean> {
        return await this.isEmpty(cellar);
    }

    async getAllOrders(): Promise<Order[]> {
        if (this.cachedOrders) {
            return this.cachedOrders;
        }
        this.cachedOrders = await this.orderRespository.fetchOrders();
        return this.cachedOrders;
    }

    async ordersGroupedByMonth(filter: ProductFilter): Promise<Map<Date, Order[]>> {
        const orders = await this.getAllOrders();
        if (filter.hasRestrictions()) {
            console.log("ordersGroupedByMonth: with filter", filter);
            let filteredOrders: Order[] = orders.map(order => this.filterOrder(order, filter)).filter(order => order != null);
            return this.groupOrdersByMonth(filteredOrders);
        }
        return this.groupOrdersByMonth(orders);
    }

    /**
     * Ingest every unprocessed inbox order into the cellarwork cellar as one
     * batch. Single-flight: a call made while a batch is already running awaits
     * and returns the same batch rather than starting a concurrent one. The
     * returned cellar is only resolved once the whole inbox has been processed
     * and each order's source document deleted — the page shows the ingested
     * contents all-or-nothing, never a partial batch.
     */
    async ingestOrdersFromInbox(): Promise<Cellar> {
        if (this.ingestionInFlight) {
            return this.ingestionInFlight;
        }
        const run = this.runInboxIngestion();
        this.ingestionInFlight = run;
        try {
            return await run;
        } finally {
            this.ingestionInFlight = null;
        }
    }

    /**
     * Ingest an order delivered as Turtle (e.g. from the photo conversion
     * service) DIRECTLY into the cellarwork cellar, without going through the Pod
     * inbox. The Turtle is materialized into order(s) — each with its embedded
     * seller, customer, and order items resolved from the RDF graph — and each is
     * ingested like an inbox order: its products are saved and one bottle per
     * ordered unit is created in cellarwork, then the freshly-built order is
     * stored locally (to be re-homed on the next sync). `ingestOrder`'s inbox
     * deletion is a no-op for these orders (they carry no inbox source document).
     *
     * Rejects when the Turtle yields no order, so the caller surfaces a failure
     * rather than presenting an empty add as success.
     */
    async ingestOrderFromTurtle(turtle: string): Promise<Cellar> {
        const cellarForCellarwork: Cellar = await this.cellarRepository.fetchCellarForCellarwork();
        const orders: Order[] = await this.orderRespository.parseOrders(turtle);
        if (orders.length === 0) {
            throw new Error("Konvertierung ergab keine Bestellung.");
        }
        for (const order of orders) {
            await this.ingestOrder(order, cellarForCellarwork.getId());
        }
        return cellarForCellarwork;
    }

    private async runInboxIngestion(): Promise<Cellar> {
        const cellarForCellarwork: Cellar = await this.cellarRepository.fetchCellarForCellarwork();
        const unprocessedOrders: Order[] = await this.orderRespository.fetchUnprocessedOrders();

        console.log("ingestOrdersFromInbox:", unprocessedOrders.length, "orders to", cellarForCellarwork.getId());
        // Process the whole batch sequentially; each order is saved locally
        // before its inbox document is deleted (save-before-delete), and a
        // failure part-way propagates so the page renders an error rather than a
        // partial cellar. Orders already processed stay saved; the documents for
        // orders not yet reached remain in the inbox for the next attempt.
        for (const order of unprocessedOrders) {
            await this.ingestOrder(order, cellarForCellarwork.getId());
        }
        return cellarForCellarwork;
    }

    async ingestOrder(order: Order, cellarForCellarwork: string) {
        // Persist the freshly-built order (seller, customer, and order items
        // embedded in one document; items referencing the new local products),
        // then clear the source from the inbox — save-local-before-delete so a
        // failed deletion never loses an already-processed order.
        const processedOrder = await this.addBottles(order, cellarForCellarwork);
        await this.orderRespository.saveProcessedOrder(processedOrder);
        // The save minted the order and its order items' URLs on the built order,
        // so back-link each product to its order item (km:orderItem) — the product
        // view resolves product → order item → order → seller from that link.
        for (const item of processedOrder.getOrderItems() ?? []) {
            const product = item.getProduct();
            if (product) {
                await this.productRepository.linkOrderItem(product, item);
            }
        }
        this.cachedOrders = null;
        await this.orderRespository.deleteFromInbox(order);
        this.cachedBottles = null;
        console.log("ingestOrder: processed order:", processedOrder.getId());
    }

    /**
     * Per-resource ingestion: for each order item, persist the product as its own
     * resource, then persist one bottle resource per ordered unit (each
     * referencing that product by URL). Returns the freshly-built order with its
     * seller, customer, and order items attached (to be saved as one document).
     */
    async addBottles(order: Order, cellarForCellarwork: string): Promise<Order> {
        const newOrder: Order = this.orderFactory.createOrder(order);

        for (const orderItem of order.getOrderItems() ?? []) {
            if (!orderItem.getOrderQuantity()) {
                continue;
            }
            const newOrderItem = this.orderFactory.createOrderItem(orderItem, newOrder);
            newOrder.addOrderItem(newOrderItem);

            const product = this.productFactory.createProduct(orderItem.getProduct(), newOrderItem);
            const savedProduct = await this.productRepository.save(product);
            // Embedded order item references the newly-created local product.
            this.orderFactory.linkProduct(newOrderItem, savedProduct);

            const bottles: Bottle[] = [];
            for (let q = 0; q < orderItem.getOrderQuantity(); q++) {
                const bottle: Bottle = this.bottleFactory.createFromProduct(savedProduct);
                bottle.setCellar(cellarForCellarwork);
                bottles.push(bottle);
            }
            await this.bottleRepository.saveAll(bottles);
        }
        return newOrder;
    }

    /**
     * Persist an in-place edit of a product's detail fields (inline editing in
     * the cellar view). The edited instance is the one already rendered, so no
     * cache is invalidated — that would refetch and re-collapse/reorder the row.
     */
    async updateProduct(product: Product): Promise<void> {
        await this.productRepository.save(product);
    }

    async disposeBottleToAltglass(bottle: Bottle, ratingValue?: number) {
        console.log("disposeBottleToAltglass: with id", bottle.getId());
        bottle.setCellar(this.getAltglassId());
        bottle.setDisposedAt(new Date());
        if (ratingValue !== undefined) {
            // The rating is stored on the bottle and rides along on the bottle
            // save below — no separate (full-document) product write needed.
            bottle.setRating(ratingValue);
        }
        await this.bottleRepository.save(bottle);
        this.cachedBottles = null;
    }

    /**
     * Add `count` new bottles of an existing product to a cellar (the "+" in the
     * cellar page's rating dialog). The product is reused, so the new bottles
     * join the existing row, which is grouped by product id.
     */
    async addBottlesOfProduct(product: Product, cellarId: string, count: number): Promise<void> {
        if (!(count > 0)) {
            return;
        }
        const bottles: Bottle[] = [];
        for (let i = 0; i < count; i++) {
            const bottle = this.bottleFactory.createFromProduct(product);
            bottle.setCellar(cellarId);
            bottles.push(bottle);
        }
        await this.bottleRepository.saveAll(bottles);
        this.cachedBottles = null;
    }

    /**
     * Permanently delete bottles from the Altglass cellar (swipe-to-delete on the
     * Altglass cellar page). Ratings stored on the bottles go with them; the
     * product is kept. Refuses — deleting nothing — if any bottle is elsewhere.
     */
    async deleteBottlesFromAltglass(bottles: Bottle[]): Promise<void> {
        const altglassId = this.getAltglassId();
        if (bottles.some(bottle => bottle.getCellar() !== altglassId)) {
            throw new Error("deleteBottlesFromAltglass: only bottles in the Altglass cellar can be deleted");
        }
        for (const bottle of bottles) {
            await this.bottleRepository.delete(bottle);
        }
        this.cachedBottles = null;
    }

    async transferBottles(bottles: Bottle[], cellarIds: string[]): Promise<void> {
        const toSave: Bottle[] = [];
        for (let i = 0; i < bottles.length; i++) {
            if (cellarIds[i] != undefined) {
                bottles[i].setCellar(cellarIds[i]);
                toSave.push(bottles[i]);
            }
        }
        console.log("transferBottles: updating number of bottles", toSave.length);
        await this.bottleRepository.saveAll(toSave);
        this.cachedBottles = null;
    }

    // -----------------------------------------------------------------

    /** Case-insensitive by product name. */
    private compareRowsByName(a: Bottle[], b: Bottle[]): number {
        return (a[0].getProduct().getName() ?? "").toLowerCase()
            .localeCompare((b[0].getProduct().getName() ?? "").toLowerCase());
    }

    /** Newest disposal first; undated rows last; ties by name. */
    private compareRowsByLatestDisposal(a: Bottle[], b: Bottle[]): number {
        const latestA = this.latestDisposal(a);
        const latestB = this.latestDisposal(b);
        if (latestA !== latestB) {
            if (latestA === undefined) {
                return 1;
            }
            if (latestB === undefined) {
                return -1;
            }
            return latestB - latestA;
        }
        return this.compareRowsByName(a, b);
    }

    private latestDisposal(bottles: Bottle[]): number | undefined {
        const times = bottles
            .map(bottle => bottle.getEffectiveDisposalDate()?.getTime())
            .filter((time): time is number => time !== undefined);
        return times.length > 0 ? Math.max(...times) : undefined;
    }

    private isBottleInThisCellar(bottle: Bottle, cellar: Cellar | undefined) {
        if (cellar) {
            return cellar.getId() == bottle.getCellar();
        }
        return false;
    }

    private filterOrder(order: Order, filter: ProductFilter): Order | null {
        const orderItems = order.getOrderItems()?.filter(position => filter.filterProduct(position.getProduct()));
        if (orderItems && orderItems.length > 0) {
            return order;
        }
        return null;
    }

    private groupOrdersByMonth(orders: Order[]): Map<Date, Order[]> {
        const unknownDate = new Date(1900, 0, 1);
        const dates: Map<string, Date> = new Map();
        const grouped = new Map<Date, Order[]>();
        for (const order of orders) {
            let dateKey: Date;
            if (order.getOrderDate()) {
                dateKey = this.getDateKey(order.getOrderDate(), dates);
            } else {
                dateKey = unknownDate;
            }
            if (!grouped.has(dateKey)) {
                grouped.set(dateKey, []);
            }
            grouped.get(dateKey)?.push(order);
        }
        // newest order first within each month; sort is stable for same-date orders
        for (const monthOrders of grouped.values()) {
            monthOrders.sort((a, b) => (b.getOrderDate()?.getTime() ?? 0) - (a.getOrderDate()?.getTime() ?? 0));
        }
        return new Map([...grouped.entries()].sort(([a], [b]) => b.getTime() - a.getTime()));
    }

    private getDateKey(date: Date, dates: Map<string, Date>): Date {
        const key: string = `${date.getFullYear()}-${date.getMonth()}-1`;
        var dateKey = dates.get(key);
        if (dateKey) {
            return dateKey;
        } else {
            dateKey = new Date(date.getFullYear(), date.getMonth(), 1)
            dates.set(key, dateKey);
            return dateKey;
        }

    }

    private async isEmpty(cellar: Cellar) {
        const bottles = await this.bottlesFromCellar(cellar, new ProductFilter());
        if (bottles.length > 0) {
            return false;
        }
        return true;
    }

}