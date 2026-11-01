import { describe, it, expect, beforeEach } from 'vitest';
import { ProductFilter } from './ProductFilter';
import type { SoukaiProduct } from '../../infrastructure/soukai/model/SoukaiProduct';

// Helper to build a minimal Product-shaped stub exposing the getters used by filterProduct().
function makeBottle(product: {
    name?: string;
    weinart?: string;
    weinfarbe?: string;
    traubensorte?: string;
    alkoholgehalt?: string;
    land?: string;
    region?: string;
    productionDate?: Date;
    trinkfensterBis?: Date;
    volumeMl?: number;
    ratings?: number[];
}): SoukaiProduct {
    return {
        getName: () => product.name,
        getWineType: () => product.weinart,
        getWineColor: () => product.weinfarbe,
        getGrapeVariety: () => product.traubensorte,
        getAlcoholContent: () => product.alkoholgehalt,
        getCountry: () => product.land,
        getRegion: () => product.region,
        getProductionDate: () => product.productionDate,
        getDrinkingWindowTo: () => product.trinkfensterBis,
        getVolumeMl: () => product.volumeMl,
        getRatings: () => (product.ratings ?? []).map((value) => ({ getValue: () => value })),
    } as unknown as SoukaiProduct;
}

describe('ProductFilter', () => {

    let filter: ProductFilter;

    beforeEach(() => {
        filter = new ProductFilter();
    });

    // -----------------------------------------------------------------
    // Toggle methods
    // -----------------------------------------------------------------

    describe('toggle methods', () => {
        it('toggleSprudelFilter flips isSprudel', () => {
            expect(filter.isSprudel).toBe(false);
            filter.toggleSprudelFilter();
            expect(filter.isSprudel).toBe(true);
            filter.toggleSprudelFilter();
            expect(filter.isSprudel).toBe(false);
        });

        it('toggleDessertFilter flips isDessert', () => {
            expect(filter.isDessert).toBe(false);
            filter.toggleDessertFilter();
            expect(filter.isDessert).toBe(true);
        });

        it('toggleWhiteFilter flips isWhite', () => {
            filter.toggleWhiteFilter();
            expect(filter.isWhite).toBe(true);
        });

        it('toggleRedFilter flips isRed', () => {
            filter.toggleRedFilter();
            expect(filter.isRed).toBe(true);
        });

        it('toggleRoseFilter flips isRose', () => {
            filter.toggleRoseFilter();
            expect(filter.isRose).toBe(true);
        });

        it('toggleTextFilter flips isText', () => {
            filter.toggleTextFilter();
            expect(filter.isText).toBe(true);
        });
    });

    // -----------------------------------------------------------------
    // filterProduct — no active filters
    // -----------------------------------------------------------------

    describe('filterProduct with no active filters', () => {
        it('passes any bottle when no filter is active', () => {
            const bottle = makeBottle({ name: 'Château Margaux', weinart: 'Wein', weinfarbe: 'rot' });
            expect(filter.filterProduct(bottle)).toBe(true);
        });

        it('passes a bottle with no product data when no filter is active', () => {
            const bottle = makeBottle({});
            expect(filter.filterProduct(bottle)).toBe(true);
        });
    });

    // -----------------------------------------------------------------
    // filterProduct — Weinart filters
    // -----------------------------------------------------------------

    describe('filterProduct with isSprudel', () => {
        beforeEach(() => { filter.isSprudel = true; });

        it('passes a Schaumwein bottle', () => {
            expect(filter.filterProduct(makeBottle({ weinart: 'Schaumwein' }))).toBe(true);
        });

        it('blocks a Wein bottle', () => {
            expect(filter.filterProduct(makeBottle({ weinart: 'Wein' }))).toBe(false);
        });

        it('blocks a Dessertwein bottle', () => {
            expect(filter.filterProduct(makeBottle({ weinart: 'Dessertwein' }))).toBe(false);
        });

        it('passes a bottle with undefined weinart (treated as match)', () => {
            // Weinart.equals(undefined) returns true
            expect(filter.filterProduct(makeBottle({}))).toBe(true);
        });
    });

    describe('filterProduct with isDessert', () => {
        beforeEach(() => { filter.isDessert = true; });

        it('passes a Dessertwein bottle', () => {
            expect(filter.filterProduct(makeBottle({ weinart: 'Dessertwein' }))).toBe(true);
        });

        it('blocks a Wein bottle', () => {
            expect(filter.filterProduct(makeBottle({ weinart: 'Wein' }))).toBe(false);
        });
    });

    // -----------------------------------------------------------------
    // filterProduct — Weinfarbe filters
    // -----------------------------------------------------------------

    describe('filterProduct with isRed', () => {
        beforeEach(() => { filter.isRed = true; });

        it('passes a red wine', () => {
            expect(filter.filterProduct(makeBottle({ weinfarbe: 'rot' }))).toBe(true);
        });

        it('blocks a white wine', () => {
            expect(filter.filterProduct(makeBottle({ weinfarbe: 'weiss' }))).toBe(false);
        });

        it('blocks a rosé wine', () => {
            expect(filter.filterProduct(makeBottle({ weinfarbe: 'rose' }))).toBe(false);
        });

        it('passes a bottle with undefined weinfarbe (treated as match)', () => {
            expect(filter.filterProduct(makeBottle({}))).toBe(true);
        });
    });

    describe('filterProduct with isWhite', () => {
        beforeEach(() => { filter.isWhite = true; });

        it('passes a white wine', () => {
            expect(filter.filterProduct(makeBottle({ weinfarbe: 'weiss' }))).toBe(true);
        });

        it('blocks a red wine', () => {
            expect(filter.filterProduct(makeBottle({ weinfarbe: 'rot' }))).toBe(false);
        });
    });

    describe('filterProduct with isRose', () => {
        beforeEach(() => { filter.isRose = true; });

        it('passes a rosé wine', () => {
            expect(filter.filterProduct(makeBottle({ weinfarbe: 'rose' }))).toBe(true);
        });

        it('blocks a red wine', () => {
            expect(filter.filterProduct(makeBottle({ weinfarbe: 'rot' }))).toBe(false);
        });
    });

    // -----------------------------------------------------------------
    // filterProduct — colour without a Weinart filter requires the still wine type
    // -----------------------------------------------------------------

    describe('colour filter without a Weinart filter selects still wine of that colour', () => {
        it('isWhite passes Weisswein and blocks Schaumwein, Wein and Dessertwein of the same colour', () => {
            filter.isWhite = true;
            expect(filter.filterProduct(makeBottle({ weinart: 'Weisswein', weinfarbe: 'weiss' }))).toBe(true);
            expect(filter.filterProduct(makeBottle({ weinart: 'Schaumwein', weinfarbe: 'weiss' }))).toBe(false);
            expect(filter.filterProduct(makeBottle({ weinart: 'Wein', weinfarbe: 'weiss' }))).toBe(false);
            expect(filter.filterProduct(makeBottle({ weinart: 'Dessertwein', weinfarbe: 'weiss' }))).toBe(false);
        });

        it('isRed passes Rotwein and blocks Schaumwein of the same colour', () => {
            filter.isRed = true;
            expect(filter.filterProduct(makeBottle({ weinart: 'Rotwein', weinfarbe: 'rot' }))).toBe(true);
            expect(filter.filterProduct(makeBottle({ weinart: 'Schaumwein', weinfarbe: 'rot' }))).toBe(false);
        });

        it('isRose passes Rosewein and blocks Schaumwein of the same colour', () => {
            filter.isRose = true;
            expect(filter.filterProduct(makeBottle({ weinart: 'Rosewein', weinfarbe: 'rose' }))).toBe(true);
            expect(filter.filterProduct(makeBottle({ weinart: 'Schaumwein', weinfarbe: 'rose' }))).toBe(false);
        });

        it('passes a product with matching colour and undefined weinart (treated as match)', () => {
            filter.isRed = true;
            expect(filter.filterProduct(makeBottle({ weinfarbe: 'rot' }))).toBe(true);
        });

        it('still blocks a still wine of a different colour', () => {
            filter.isWhite = true;
            expect(filter.filterProduct(makeBottle({ weinart: 'Rotwein', weinfarbe: 'rot' }))).toBe(false);
        });
    });

    describe('colour filter with a Weinart filter selects that Weinart of that colour', () => {
        it('isSprudel + isRose passes Schaumwein/rose and blocks Rosewein/rose', () => {
            filter.isSprudel = true;
            filter.isRose = true;
            expect(filter.filterProduct(makeBottle({ weinart: 'Schaumwein', weinfarbe: 'rose' }))).toBe(true);
            expect(filter.filterProduct(makeBottle({ weinart: 'Rosewein', weinfarbe: 'rose' }))).toBe(false);
        });

        it('isDessert + isWhite passes Dessertwein/weiss and blocks Weisswein/weiss', () => {
            filter.isDessert = true;
            filter.isWhite = true;
            expect(filter.filterProduct(makeBottle({ weinart: 'Dessertwein', weinfarbe: 'weiss' }))).toBe(true);
            expect(filter.filterProduct(makeBottle({ weinart: 'Weisswein', weinfarbe: 'weiss' }))).toBe(false);
        });
    });

    // -----------------------------------------------------------------
    // filterProduct — combined filters (AND logic)
    // -----------------------------------------------------------------

    describe('combined filters apply AND logic', () => {
        it('passes only when both weinart and weinfarbe match', () => {
            filter.isSprudel = true;
            filter.isWhite = true;
            expect(filter.filterProduct(makeBottle({ weinart: 'Schaumwein', weinfarbe: 'weiss' }))).toBe(true);
            expect(filter.filterProduct(makeBottle({ weinart: 'Schaumwein', weinfarbe: 'rot' }))).toBe(false);
            expect(filter.filterProduct(makeBottle({ weinart: 'Wein', weinfarbe: 'weiss' }))).toBe(false);
        });

        it('isRed and isSprudel together require rot + Schaumwein', () => {
            filter.isRed = true;
            filter.isSprudel = true;
            expect(filter.filterProduct(makeBottle({ weinart: 'Schaumwein', weinfarbe: 'rot' }))).toBe(true);
            expect(filter.filterProduct(makeBottle({ weinart: 'Wein', weinfarbe: 'rot' }))).toBe(false);
        });
    });

    // -----------------------------------------------------------------
    // filterProduct — text filter
    // -----------------------------------------------------------------

    describe('filterProduct with text filter', () => {
        beforeEach(() => {
            filter.isText = true;
        });

        it('passes when name matches (case-insensitive)', () => {
            filter.textFilter = 'bordeaux';
            expect(filter.filterProduct(makeBottle({ name: 'Château Bordeaux', trinkfensterBis: new Date(2030, 0, 1) }))).toBe(true);
            expect(filter.filterProduct(makeBottle({ name: 'CHÂTEAU BORDEAUX', trinkfensterBis: new Date(2030, 0, 1) }))).toBe(true);
        });

        it('ignores diacritics in the name', () => {
            filter.textFilter = 'bereche';
            expect(filter.filterProduct(makeBottle({ name: 'Bérêche Brut Réserve' }))).toBe(true);
        });

        it('ignores diacritics in the entered text', () => {
            filter.textFilter = 'Bérêche';
            expect(filter.filterProduct(makeBottle({ name: 'Bereche Brut Reserve' }))).toBe(true);
        });

        it('ignores diacritics in region, grape variety and country', () => {
            filter.textFilter = 'rotie';
            expect(filter.filterProduct(makeBottle({ region: 'Côte-Rôtie' }))).toBe(true);
            filter.textFilter = 'gruner';
            expect(filter.filterProduct(makeBottle({ traubensorte: 'Grüner Veltliner' }))).toBe(true);
            filter.textFilter = 'osterreich';
            expect(filter.filterProduct(makeBottle({ land: 'Österreich' }))).toBe(true);
        });

        it('matches ligatures by their spelled-out letters', () => {
            filter.textFilter = 'coeur';
            expect(filter.filterProduct(makeBottle({ name: 'Cœur de Cuvée' }))).toBe(true);
            filter.textFilter = 'strasse';
            expect(filter.filterProduct(makeBottle({ name: 'Weinstraße' }))).toBe(true);
        });

        it('matches decomposed accents as typed on some keyboards', () => {
            filter.textFilter = 'bere\u0301che';
            expect(filter.filterProduct(makeBottle({ name: 'Bérêche' }))).toBe(true);
        });

        it('blocks when name does not match and other fields are absent', () => {
            filter.textFilter = 'riesling';
            // bottle has a defined trinkfensterBis so the ternary fallback can be evaluated
            expect(filter.filterProduct(makeBottle({ name: 'Chardonnay', trinkfensterBis: new Date(2030, 0, 1) }))).toBe(false);
        });

        it('passes when traubensorte matches', () => {
            filter.textFilter = 'pinot';
            expect(filter.filterProduct(makeBottle({ traubensorte: 'Pinot Noir', trinkfensterBis: new Date(2030, 0, 1) }))).toBe(true);
        });

        it('passes when alkoholgehalt matches', () => {
            filter.textFilter = '13.5';
            expect(filter.filterProduct(makeBottle({ alkoholgehalt: '13.5%', trinkfensterBis: new Date(2030, 0, 1) }))).toBe(true);
        });

        it('passes when land matches (case-insensitive)', () => {
            filter.textFilter = 'frankreich';
            expect(filter.filterProduct(makeBottle({ land: 'Frankreich', trinkfensterBis: new Date(2030, 0, 1) }))).toBe(true);
        });

        it('passes when region matches (case-insensitive)', () => {
            filter.textFilter = 'burgund';
            expect(filter.filterProduct(makeBottle({ region: 'Burgund', trinkfensterBis: new Date(2030, 0, 1) }))).toBe(true);
        });

        it('passes "bis <year>" when trinkfensterBis year < entered year', () => {
            filter.textFilter = 'bis 2025';
            expect(filter.filterProduct(makeBottle({ trinkfensterBis: new Date(2024, 0, 1) }))).toBe(true);
        });

        it('passes "bis <year>" when trinkfensterBis year equals entered year', () => {
            filter.textFilter = 'bis 2025';
            expect(filter.filterProduct(makeBottle({ trinkfensterBis: new Date(2025, 11, 31) }))).toBe(true);
        });

        it('blocks "bis <year>" when trinkfensterBis year > entered year', () => {
            filter.textFilter = 'bis 2020';
            expect(filter.filterProduct(makeBottle({ trinkfensterBis: new Date(2025, 0, 1) }))).toBe(false);
        });

        it('blocks "bis <year>" when trinkfensterBis is undefined', () => {
            filter.textFilter = 'bis 2025';
            expect(filter.filterProduct(makeBottle({ name: 'Merlot' }))).toBe(false);
        });

        it('accepts case and whitespace variants of "bis <year>"', () => {
            const bottle = makeBottle({ trinkfensterBis: new Date(2024, 0, 1) });
            for (const text of ['Bis 2025', 'BIS2025', '  bis   2025  ']) {
                filter.textFilter = text;
                expect(filter.filterProduct(bottle)).toBe(true);
            }
        });

        it('does not search regular text fields for "bis <year>"', () => {
            filter.textFilter = 'bis 2025';
            expect(filter.filterProduct(makeBottle({ name: 'Cuvée bis 2025', trinkfensterBis: new Date(2030, 0, 1) }))).toBe(false);
        });

        it('ignores trinkfensterBis for a bare year', () => {
            filter.textFilter = '2025';
            expect(filter.filterProduct(makeBottle({ trinkfensterBis: new Date(2024, 0, 1) }))).toBe(false);
        });

        it('treats near-misses of "bis <year>" as plain text', () => {
            const bottle = makeBottle({ name: 'Chardonnay', trinkfensterBis: new Date(2020, 0, 1) });
            for (const text of ['bis 25', 'bis 2025 rot', 'bisher']) {
                filter.textFilter = text;
                expect(filter.filterProduct(bottle)).toBe(false);
            }
        });

        it('passes "ml <size>" only for exactly that Flaschengrösse', () => {
            filter.textFilter = 'ml1500';
            expect(filter.filterProduct(makeBottle({ volumeMl: 1500 }))).toBe(true);
            expect(filter.filterProduct(makeBottle({ volumeMl: 750 }))).toBe(false);
            expect(filter.filterProduct(makeBottle({ name: 'Magnum ohne Grösse' }))).toBe(false);
        });

        it('accepts case and whitespace variants of "ml <size>"', () => {
            const magnum = makeBottle({ volumeMl: 1500 });
            for (const text of ['ML1500', 'ml 1500', '  Ml   1500  ']) {
                filter.textFilter = text;
                expect(filter.filterProduct(magnum)).toBe(true);
            }
        });

        it('does not search regular text fields for "ml <size>"', () => {
            filter.textFilter = 'ml 750';
            expect(filter.filterProduct(makeBottle({ name: 'Cuvée ml 750', volumeMl: 1500 }))).toBe(false);
        });

        it('ignores the Flaschengrösse for a bare size', () => {
            filter.textFilter = '1500';
            expect(filter.filterProduct(makeBottle({ volumeMl: 1500 }))).toBe(false);
        });

        it('treats near-misses of "ml <size>" as plain text', () => {
            const bottle = makeBottle({ name: 'Chardonnay', volumeMl: 1500 });
            for (const text of ['ml', 'ml 1500 rot', '1500ml', 'mlx']) {
                filter.textFilter = text;
                expect(filter.filterProduct(bottle)).toBe(false);
            }
        });

        it('passes "top<N>" only when a rating is exactly N', () => {
            filter.textFilter = 'top3';
            expect(filter.filterProduct(makeBottle({ ratings: [3] }))).toBe(true);
            filter.textFilter = 'top2';
            expect(filter.filterProduct(makeBottle({ ratings: [3] }))).toBe(false);
        });

        it('passes "top<N>" when any of several ratings is N', () => {
            filter.textFilter = 'top1';
            expect(filter.filterProduct(makeBottle({ ratings: [3, 1] }))).toBe(true);
        });

        it('blocks "top<N>" for a product without ratings', () => {
            filter.textFilter = 'top3';
            expect(filter.filterProduct(makeBottle({ name: 'Unbewertet' }))).toBe(false);
        });

        it('accepts case and whitespace variants of "top<N>"', () => {
            const rated = makeBottle({ ratings: [3] });
            for (const text of ['TOP3', 'top 3', '  Top   3  ']) {
                filter.textFilter = text;
                expect(filter.filterProduct(rated)).toBe(true);
            }
        });

        it('does not search regular text fields for "top<N>"', () => {
            filter.textFilter = 'top 3';
            expect(filter.filterProduct(makeBottle({ name: 'Cuvée top 3', ratings: [1] }))).toBe(false);
        });

        it('treats near-misses of "top<N>" as plain text', () => {
            const bottle = makeBottle({ name: 'Chardonnay', ratings: [0, 3, 4] });
            for (const text of ['top', 'top0', 'top4', 'top 3 rot', 'topwein']) {
                filter.textFilter = text;
                expect(filter.filterProduct(bottle)).toBe(false);
            }
        });

        it('passes any text when textFilter is null', () => {
            filter.textFilter = null;
            expect(filter.filterProduct(makeBottle({ name: 'anything', trinkfensterBis: new Date(2030, 0, 1) }))).toBe(true);
        });

        it('passes any text filter when trinkfensterBis is undefined (operator precedence)', () => {
            filter.textFilter = 'xyz_no_match';
            const bottle = makeBottle({ name: 'Completely Different Wine' }); // no trinkfensterBis
            expect(filter.filterProduct(bottle)).toBe(false);
        });

        it('combines text filter with weinfarbe filter using AND logic', () => {
            filter.textFilter = 'bordeaux';
            filter.isRed = true;
            expect(filter.filterProduct(makeBottle({ name: 'Bordeaux Rouge', weinfarbe: 'rot', trinkfensterBis: new Date(2030, 0, 1) }))).toBe(true);
            expect(filter.filterProduct(makeBottle({ name: 'Bordeaux Blanc', weinfarbe: 'weiss', trinkfensterBis: new Date(2030, 0, 1) }))).toBe(false);
        });
    });
});
