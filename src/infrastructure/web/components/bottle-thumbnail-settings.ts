import {DEFAULT_THUMBNAIL_SETTINGS, type ThumbnailSettings} from "./bottle-thumbnail-format.ts";

const STORAGE_KEY = "kellermeister:thumbnail-settings";

/** Fired on `window` when the thumbnail settings change, so mounted rows re-render. */
export const THUMBNAIL_SETTINGS_CHANGED_EVENT = "kellermeister:thumbnail-settings-changed";

/** Per-device thumbnail settings, kept in localStorage (falls back to the defaults). */
export function loadThumbnailSettings(): ThumbnailSettings {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            return {
                country: parsed?.country === true,
                region: parsed?.region === true,
                drinkingWindow: parsed?.drinkingWindow === true,
            };
        }
    } catch (error) {
        console.warn("loadThumbnailSettings: could not read settings", error);
    }
    return {...DEFAULT_THUMBNAIL_SETTINGS};
}

export function saveThumbnailSettings(settings: ThumbnailSettings): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
        console.warn("saveThumbnailSettings: could not store settings", error);
    }
    window.dispatchEvent(new CustomEvent(THUMBNAIL_SETTINGS_CHANGED_EVENT, {detail: settings}));
}
