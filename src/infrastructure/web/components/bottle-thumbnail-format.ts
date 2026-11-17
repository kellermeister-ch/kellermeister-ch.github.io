/** Which optional details the collapsed bottle row ("thumbnail") shows. */
export interface ThumbnailSettings {
    country: boolean;
    region: boolean;
    drinkingWindow: boolean;
}

export const DEFAULT_THUMBNAIL_SETTINGS: ThumbnailSettings = {
    country: false,
    region: false,
    drinkingWindow: false,
};

/** The product fields the thumbnail can show; values may be missing at runtime. */
export interface ThumbnailProduct {
    getCountry(): string | undefined;
    getRegion(): string | undefined;
    getDrinkingWindowFrom(): Date | undefined;
    getDrinkingWindowTo(): Date | undefined;
}

/**
 * The detail parts shown under the product name, in display order
 * (region, country, drinking window). Empty values are skipped.
 */
export function formatThumbnailDetails(product: ThumbnailProduct, settings: ThumbnailSettings): string[] {
    const parts: string[] = [];
    if (settings.region) {
        const region = product.getRegion()?.trim();
        if (region) parts.push(region);
    }
    if (settings.country) {
        const country = product.getCountry()?.trim();
        if (country) parts.push(country);
    }
    if (settings.drinkingWindow) {
        const window = formatDrinkingWindow(product.getDrinkingWindowFrom(), product.getDrinkingWindowTo());
        if (window) parts.push(window);
    }
    return parts;
}

function formatDrinkingWindow(from: Date | undefined, to: Date | undefined): string | undefined {
    const fromYear = validYear(from);
    const toYear = validYear(to);
    if (fromYear && toYear) return fromYear === toYear ? `${fromYear}` : `${fromYear}–${toYear}`;
    if (fromYear) return `ab ${fromYear}`;
    if (toYear) return `bis ${toYear}`;
    return undefined;
}

function validYear(date: Date | undefined): number | undefined {
    if (!(date instanceof Date) || isNaN(date.getTime())) return undefined;
    return date.getFullYear();
}
