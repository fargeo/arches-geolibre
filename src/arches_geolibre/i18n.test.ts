import {
    bundledTranslations,
    createPluginGettext,
} from "@/arches_geolibre/i18n.ts";

import type { GeoLibreAppAPI } from "@/arches_geolibre/geolibre/host-api.ts";

function geoLibreWithLocale(locale: string): GeoLibreAppAPI {
    return { addGeoJsonLayer: () => "", getLocale: () => locale };
}

describe("createPluginGettext", () => {
    it("falls back to English for languages without translations", () => {
        expect(createPluginGettext(geoLibreWithLocale("zh")).current).toBe(
            "en",
        );
        expect(createPluginGettext(geoLibreWithLocale("en-GB")).current).toBe(
            "en",
        );
    });

    it("bundles the compiled English catalog", () => {
        expect(bundledTranslations().en).toMatchObject({
            "Push to Arches": "Push to Arches",
        });
    });
});
