import { createGettext } from "vue3-gettext";

import type { Language } from "vue3-gettext";
import type { GeoLibreAppAPI } from "@/arches_geolibre/geolibre/host-api.ts";

const DEFAULT_LANGUAGE = "en";
const AVAILABLE_LANGUAGES: Record<string, string> = { en: "English" };

// Compiled by `npm run gettext:compile` into one JSON file per language.
const COMPILED_TRANSLATIONS = import.meta.glob<
    Record<string, Record<string, string | string[]>>
>("./locale/*.json", { eager: true, import: "default" });

export function createPluginGettext(geolibreApp: GeoLibreAppAPI): Language {
    return createGettext({
        availableLanguages: AVAILABLE_LANGUAGES,
        defaultLanguage: toAvailableLanguage(geolibreApp.getLocale?.()),
        translations: bundledTranslations(),
        silent: true,
    });
}

export function bundledTranslations(): Record<
    string,
    Record<string, string | string[]>
> {
    return Object.assign({}, ...Object.values(COMPILED_TRANSLATIONS));
}

/** Keeps the plugin's language in step with GeoLibre's. */
export function followGeoLibreLocale(
    gettext: Language,
    geolibreApp: GeoLibreAppAPI,
): () => void {
    return (
        geolibreApp.onLocaleChange?.((locale) => {
            gettext.current = toAvailableLanguage(locale);
        }) ?? (() => {})
    );
}

function toAvailableLanguage(locale: string | undefined): string {
    if (!locale) {
        return DEFAULT_LANGUAGE;
    }
    if (locale in AVAILABLE_LANGUAGES) {
        return locale;
    }
    const baseLanguage = locale.split(/[-_]/)[0];
    return baseLanguage in AVAILABLE_LANGUAGES
        ? baseLanguage
        : DEFAULT_LANGUAGE;
}
