import type {BottleRepository} from "../../domain/Bottle/BottleRepository.ts";
import type {Bottle} from "../../domain/Bottle/Bottle.ts";
import {SoukaiBottle} from "./model/SoukaiBottle.ts";
import {SoukaiProduct} from "./model/SoukaiProduct.ts";
import {bootSoukaiModels} from "./bootModels.ts";
import {fetchLive} from "./localFirstQuery.ts";
import {mintProvisional} from "../shared/resource-identity.ts";
import type {SoukaiProductRepository} from "./SoukaiProductRepository.ts";
import {withLocalEngine} from "./engineScope.ts";

/**
 * Local-first, per-resource bottle repository. Bottles are separate resources
 * referencing their product by URL; on read, products are fetched once and
 * joined in memory (cross-container relations are lazy — see the save spike).
 */
export class SoukaiBottleRepository implements BottleRepository {

    constructor(
        private readonly podBase: () => string | null,
        private readonly productRepository: SoukaiProductRepository,
    ) {
        bootSoukaiModels();
    }

    async fetchBottles(): Promise<Bottle[]> {
        const bottles = await fetchLive<SoukaiBottle>(SoukaiBottle, "bottles", this.podBase());
        const products = await this.productRepository.fetchAll();
        const productByUrl = new Map(products.map((product) => [product.url, product]));

        // Resolve each bottle's (same-document) rating so it is available for the
        // product's aggregated rating display. Same-document relations are not
        // auto-populated on read — they must be loaded explicitly.
        // A rating still embedded as a node (the previous storage form) is copied
        // into the bottle's rating properties once and saved, so the next sync
        // brings it to the Pod — the sync drops embedded nodes of documents that
        // already exist there.
        await withLocalEngine(async () => {
            for (const bottle of bottles) {
                await bottle.loadRelation("rating");
                if (bottle.adoptEmbeddedRating()) {
                    await bottle.save();
                }
            }
        });

        // Join product ↔ bottle in BOTH directions in memory. Cross-container
        // relations are not query-loadable here (products and bottles live in
        // separate containers), so the product → bottles link — which lets a
        // product aggregate the ratings stored on its bottles (getRatings()) —
        // is wired the same way as the bottle → product link.
        const bottlesByProduct = new Map<string, SoukaiBottle[]>();
        for (const bottle of bottles) {
            const product = bottle.productUrl ? productByUrl.get(bottle.productUrl) : undefined;
            if (product) {
                bottle.relatedProduct.setRelated(product);
                const group = bottlesByProduct.get(product.url as string) ?? [];
                group.push(bottle);
                bottlesByProduct.set(product.url as string, group);
            }
        }
        for (const product of products) {
            product.relatedBottles.related = bottlesByProduct.get(product.url as string) ?? [];
        }
        // Preserve the previous invariant: only bottles with a resolved product
        // are surfaced (downstream code assumes bottle.getProduct() is present).
        return bottles.filter((bottle) => bottle.getProduct());
    }

    async save(bottle: Bottle): Promise<Bottle> {
        const model = bottle as SoukaiBottle;
        if (!model.url) {
            model.url = mintProvisional("bottles");
        }
        if (!model.productUrl && model.getProduct()) {
            model.productUrl = (model.getProduct() as SoukaiProduct).url;
        }
        await withLocalEngine(() => model.save());
        return model;
    }

    async saveAll(bottles: Bottle[]): Promise<void> {
        for (const bottle of bottles) {
            await this.save(bottle);
        }
    }

    async delete(bottle: Bottle): Promise<void> {
        await withLocalEngine(() => (bottle as SoukaiBottle).delete());
    }
}
