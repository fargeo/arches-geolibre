import { inject } from "vue";

import { GEOLIBRE_APP_KEY } from "@/arches_geolibre/constants.ts";

import type { GeoLibreAppAPI } from "@/arches_geolibre/geolibre/host-api.ts";

export function useGeoLibreApp(): GeoLibreAppAPI {
    const geolibreApp = inject(GEOLIBRE_APP_KEY);
    if (!geolibreApp) {
        throw new Error("The GeoLibre app API was not provided.");
    }
    return geolibreApp;
}

/**
 * On desktop, GeoLibre's native HTTP client reaches any Arches instance
 * without CORS configuration; the browser build falls back to window.fetch.
 */
export function useArchesFetch(): typeof fetch {
    const geolibreApp = useGeoLibreApp();
    return geolibreApp.nativeFetch ?? window.fetch.bind(window);
}

/** Opens a page in the system browser on desktop, or a new tab on the web. */
export function useOpenExternalUrl(): (url: string) => void {
    const geolibreApp = useGeoLibreApp();
    return (url) => {
        if (geolibreApp.openExternalUrl) {
            geolibreApp.openExternalUrl(url);
        } else {
            window.open(url, "_blank", "noopener");
        }
    };
}
