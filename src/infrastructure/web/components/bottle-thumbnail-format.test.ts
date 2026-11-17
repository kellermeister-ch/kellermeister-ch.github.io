import {describe, it, expect} from "vitest";
import {DEFAULT_THUMBNAIL_SETTINGS, formatThumbnailDetails, type ThumbnailProduct} from "./bottle-thumbnail-format.ts";

function product(fields: {country?: string, region?: string, from?: Date, to?: Date}): ThumbnailProduct {
    return {
        getCountry: () => fields.country,
        getRegion: () => fields.region,
        getDrinkingWindowFrom: () => fields.from,
        getDrinkingWindowTo: () => fields.to,
    };
}

const ALL = {country: true, region: true, drinkingWindow: true};

describe("formatThumbnailDetails", () => {
    it("shows nothing with the default settings", () => {
        const p = product({country: "Italien", region: "Piemont", from: new Date(2025, 0, 1), to: new Date(2030, 0, 1)});
        expect(formatThumbnailDetails(p, DEFAULT_THUMBNAIL_SETTINGS)).toEqual([]);
    });

    it("shows region, country and drinking window in that order", () => {
        const p = product({country: "Italien", region: "Piemont", from: new Date(2025, 0, 1), to: new Date(2030, 0, 1)});
        expect(formatThumbnailDetails(p, ALL)).toEqual(["Piemont", "Italien", "2025–2030"]);
    });

    it("shows only the enabled details", () => {
        const p = product({country: "Italien", region: "Piemont", from: new Date(2025, 0, 1), to: new Date(2030, 0, 1)});
        expect(formatThumbnailDetails(p, {country: true, region: false, drinkingWindow: false})).toEqual(["Italien"]);
    });

    it("skips missing or blank values", () => {
        expect(formatThumbnailDetails(product({region: "  "}), ALL)).toEqual([]);
    });

    it("formats open-ended and single-year drinking windows", () => {
        const only = {country: false, region: false, drinkingWindow: true};
        expect(formatThumbnailDetails(product({from: new Date(2026, 0, 1)}), only)).toEqual(["ab 2026"]);
        expect(formatThumbnailDetails(product({to: new Date(2031, 0, 1)}), only)).toEqual(["bis 2031"]);
        expect(formatThumbnailDetails(product({from: new Date(2027, 0, 1), to: new Date(2027, 5, 1)}), only)).toEqual(["2027"]);
        expect(formatThumbnailDetails(product({from: new Date("invalid")}), only)).toEqual([]);
    });
});
