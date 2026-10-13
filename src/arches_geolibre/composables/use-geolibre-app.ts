import { inject } from "vue";

import {
    ARCHES_FETCH_KEY,
    GEOLIBRE_APP_KEY,
} from "@/arches_geolibre/constants.ts";

import type { GeoLibreAppAPI } from "@/arches_geolibre/geolibre/host-api.ts";

export function useGeoLibreApp(): GeoLibreAppAPI {
    const geolibreApp = inject(GEOLIBRE_APP_KEY);
    if (!geolibreApp) {
        throw new Error("The GeoLibre app API was not provided.");
    }
    return geolibreApp;
}

/** The fetch for Arches requests, keeping the session's token current. */
export function useArchesFetch(): typeof fetch {
    const archesFetch = inject(ARCHES_FETCH_KEY);
    if (!archesFetch) {
        throw new Error("The Arches fetch was not provided.");
    }
    return archesFetch;
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
