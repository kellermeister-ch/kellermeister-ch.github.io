import type {BelongsToOneRelation} from "soukai-bis";
import Model from "./SoukaiBottle.schema";
import type {Bottle} from "../../../domain/Bottle/Bottle.ts";
import type {Rating} from "../../../domain/Product/Rating.ts";
import {SoukaiProduct} from "./SoukaiProduct.ts";
import {SoukaiRating} from "./SoukaiRating.ts";

export class SoukaiBottle extends Model implements Bottle {

    // Relation wiring lives in SoukaiBottle.schema.ts (per-resource: a Product is
    // its own Pod resource, referenced by URL, NOT embedded in the bottle document).
    declare public product: SoukaiProduct;
    declare public relatedProduct: BelongsToOneRelation<this, SoukaiProduct, typeof SoukaiProduct>;

    // A single rating embedded in the bottle document (same-document relation).
    declare public rating: SoukaiRating;
    declare public relatedRating: BelongsToOneRelation<this, SoukaiRating, typeof SoukaiRating>;

    getId(): string {
        return this.url as string;
    }
    getCellar(): string {
        // cellarUrl is optional at the schema level (a bottle can be built before
        // its cellar is assigned), but every persisted/read bottle has one.
        return this.cellarUrl as string;
    }
    setCellar(cellarId: string): void {
        this.cellarUrl = cellarId;
    }
    getProduct(): SoukaiProduct {
        return this.product;
    }
    getRating(): Rating | undefined {
        // Prefer the rating stored as properties of this bottle.
        const value = this.orUndefined(this.ratingValue);
        if (value !== undefined) {
            const date = this.ratedAt ?? undefined;
            return {
                getId: () => this.getId(),
                getValue: () => value,
                getDate: () => date as unknown as Date,
            };
        }
        // Backward-compat: a rating embedded as a node in the bottle document
        // (written before ratings became bottle properties).
        if (this.rating) {
            return this.rating;
        }
        // Backward-compat: surface a legacy numeric schema:rating (written by old
        // pods before ratings became structured) as a dateless Rating.
        const legacy = this.orUndefined(this.legacyRating);
        if (legacy !== undefined) {
            return {
                getId: () => this.getId(),
                getValue: () => legacy,
                getDate: () => undefined as unknown as Date,
            };
        }
        return undefined;
    }
    setRating(value: number): void {
        // Plain properties of the bottle resource, so the change is recorded in
        // the bottle's operation log and synced. An embedded rating node is not:
        // the Pod sync drops it once the bottle document exists on the Pod.
        this.ratingValue = value;
        this.ratedAt = new Date();
    }

    /**
     * Copy a rating embedded as a node (the previous storage form) into the
     * bottle's rating properties, so the next sync brings it to the Pod.
     * Requires the `rating` relation to be loaded.
     *
     * @returns whether the bottle changed and needs to be saved.
     */
    adoptEmbeddedRating(): boolean {
        if (this.ratingValue !== undefined || !this.rating?.value) {
            return false;
        }
        this.ratingValue = this.rating.value;
        this.ratedAt = this.rating.date ?? undefined;
        return true;
    }

    getDisposedAt(): Date | undefined {
        return this.disposedAt ?? undefined;
    }
    setDisposedAt(date: Date): void {
        this.disposedAt = date;
    }
    getEffectiveDisposalDate(): Date | undefined {
        // Legacy bottles have no stored date: the rating is dated at disposal
        // time; the legacy numeric rating is dateless and skipped.
        return this.getDisposedAt() ?? this.ratedAt ?? this.rating?.date ?? this.updatedAt ?? undefined;
    }

    private orUndefined(value: any): any | undefined {
        return value ? value : undefined;
    }

}
