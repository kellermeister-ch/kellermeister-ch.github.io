import {Weinart} from "./Weinart.ts";
import {Weinfarbe} from "./Weinfarbe.ts";
import type {Product} from "./Product.ts";

export class ProductFilter {

    // Weinart
    public isSprudel: boolean = false;
    public isDessert: boolean = false;

    // Weinfarbe
    public isWhite: boolean = false;
    public isRed: boolean = false;
    public isRose: boolean = false;

    public isText: boolean = false;
    public textFilter: string | null = null;

    public toggleSprudelFilter(): void {
        this.isSprudel = !this.isSprudel;
    }

    public toggleDessertFilter(): void {
        this.isDessert = !this.isDessert;
    }

    public toggleWhiteFilter(): void {
        this.isWhite = !this.isWhite;
    }

    public toggleRedFilter(): void {
        this.isRed = !this.isRed;
    }

    public toggleRoseFilter(): void {
        this.isRose = !this.isRose;
    }

    public toggleTextFilter(): void {
        this.isText = !this.isText;
    }

    public toSearchParams(): URLSearchParams {
        const params = new URLSearchParams();
        if (this.isSprudel) params.set('sprudel', '1');
        if (this.isDessert) params.set('dessert', '1');
        if (this.isWhite) params.set('weiss', '1');
        if (this.isRed) params.set('rot', '1');
        if (this.isRose) params.set('rose', '1');
        if (this.isText && this.textFilter) params.set('text', this.textFilter);
        return params;
    }

    public static fromSearchParams(params: URLSearchParams): ProductFilter {
        const filter = new ProductFilter();
        filter.isSprudel = params.has('sprudel');
        filter.isDessert = params.has('dessert');
        filter.isWhite = params.has('weiss');
        filter.isRed = params.has('rot');
        filter.isRose = params.has('rose');
        const text = params.get('text');
        if (text) {
            filter.isText = true;
            filter.textFilter = text;
        }
        return filter;
    }

    public hasRestrictions(): boolean {
        return (this.isSprudel || this.isDessert || this.isWhite || this.isRed || this.isRose || this.isText);
    }

    public filterProduct(product: Product): boolean {
        let result: boolean = true;
        // Weinart
        if (this.isSprudel) {
            result = result && Weinart.Schaumwein.equals(product.getWineType());
        }
        if (this.isDessert) {
            result = result && Weinart.Dessertwein.equals(product.getWineType());
        }
        // Weinfarbe — without a Weinart filter, a colour selects the still wine of that colour
        const isWeinartFilter = this.isSprudel || this.isDessert;
        if (this.isWhite) {
            result = result && Weinfarbe.Weiss.equals(product.getWineColor());
            if (!isWeinartFilter) {
                result = result && Weinart.Weisswein.equals(product.getWineType());
            }
        }
        if (this.isRed) {
            result = result && Weinfarbe.Rot.equals(product.getWineColor());
            if (!isWeinartFilter) {
                result = result && Weinart.Rotwein.equals(product.getWineType());
            }
        }
        if (this.isRose) {
            result = result && Weinfarbe.Rose.equals(product.getWineColor());
            if (!isWeinartFilter) {
                result = result && Weinart.Rosewein.equals(product.getWineType());
            }
        }
        // Text
        if (this.isText) {
            if (this.textFilter) {
                const drinkingWindowYear = ProductFilter.parseDrinkingWindowYear(this.textFilter);
                const bottleSizeMl = ProductFilter.parseBottleSizeMl(this.textFilter);
                const rating = ProductFilter.parseRatingQuery(this.textFilter);
                if (drinkingWindowYear !== null) {
                    result = result && this.endsDrinkingWindowBy(drinkingWindowYear, product.getDrinkingWindowTo()?.getFullYear());
                } else if (bottleSizeMl !== null) {
                    result = result && product.getVolumeMl() === bottleSizeMl;
                } else if (rating !== null) {
                    result = result && (product.getRatings() ?? []).some(r => r.getValue() === rating);
                } else {
                    const text = ProductFilter.normalizeForSearch(this.textFilter);
                    result = result && (
                        this.isIncludedIn(text, product.getName())
                        || this.isIncludedIn(text, product.getProductionDate()?.toUTCString())
                        || this.isIncludedIn(text, product.getGrapeVariety())
                        || this.isIncludedIn(text, product.getAlcoholContent())
                        || this.isIncludedIn(text, product.getCountry())
                        || this.isIncludedIn(text, product.getRegion())
                    );
                }
            }
        }
        return result;
    }

    private isIncludedIn(filter: string, value: string | undefined): boolean {
        if (value === undefined) {
            return false;
        }
        const result = ProductFilter.normalizeForSearch(value).includes(filter);
        return result;
    }

    // Letters that NFD does not split into a base letter and a combining mark.
    private static readonly FOLDED_LETTERS: Record<string, string> = {
        'œ': 'oe', 'æ': 'ae', 'ß': 'ss', 'ø': 'o', 'đ': 'd', 'ł': 'l',
    };

    // Lower-cases the text and removes diacritics, so that "Bérêche" and "bereche" compare equal.
    private static normalizeForSearch(text: string): string {
        return text.normalize('NFD')
            .replace(/\p{M}/gu, '')
            .toLowerCase()
            .replace(/[œæßøđł]/g, (letter) => ProductFilter.FOLDED_LETTERS[letter]);
    }

    // Parses "bis <year>" (e.g. "bis 2025") and returns the year, or null for any other text.
    private static parseDrinkingWindowYear(text: string): number | null {
        const match = /^bis\s*(\d{4})$/i.exec(text.trim());
        return match ? Number(match[1]) : null;
    }

    // Parses "ml <size>" (e.g. "ml1500") and returns the size in millilitres, or null for any other text.
    private static parseBottleSizeMl(text: string): number | null {
        const match = /^ml\s*(\d+)$/i.exec(text.trim());
        return match ? Number(match[1]) : null;
    }

    // Parses "top <N>" (e.g. "top3", N = 1..3) and returns the rating, or null for any other text.
    private static parseRatingQuery(text: string): number | null {
        const match = /^top\s*([1-3])$/i.exec(text.trim());
        return match ? Number(match[1]) : null;
    }

    private endsDrinkingWindowBy(year: number, drinkingWindowToYear: number | undefined): boolean {
        if (drinkingWindowToYear === undefined) {
            return false;
        }
        return drinkingWindowToYear <= year;
    }

}