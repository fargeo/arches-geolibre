import { createApp } from "vue";

import OpenVue from "openvue/config";

import ArchesPanel from "@/arches_geolibre/ArchesPanel.vue";
import {
    ARCHES_FETCH_KEY,
    GEOLIBRE_APP_KEY,
    WORKSPACE_KEY,
} from "@/arches_geolibre/constants.ts";
import {
    createPluginGettext,
    followGeoLibreLocale,
} from "@/arches_geolibre/i18n.ts";
import { ArchesGeoLibrePreset } from "@/arches_geolibre/theme.ts";
import { workspaceSessionStore } from "@/arches_geolibre/utils/arches-session.ts";
import { createRefreshingFetch } from "@/arches_geolibre/utils/session-refresh.ts";
import { createRetryingFetch } from "@/arches_geolibre/utils/transient-retry.ts";

import type { App } from "vue";
import type { GeoLibreAppAPI } from "@/arches_geolibre/geolibre/host-api.ts";
import type { ArchesWorkspace } from "@/arches_geolibre/workspace.ts";

/**
 * OpenVue injects its theme as global <style> tags. They stay unlayered: in a
 * cascade layer they would lose to every unlayered rule in GeoLibre's
 * stylesheet, including element resets. Unlayered, OpenVue's class selectors
 * outrank those resets on specificity. The custom prefix keeps OpenVue's CSS
 * variables from colliding with anything else on the page, and dark mode
 * follows the `dark` class GeoLibre toggles on <html>.
 */
export function createPanelApp(
    geolibreApp: GeoLibreAppAPI,
    workspace: ArchesWorkspace,
): { panelApp: App; stopFollowingLocale: () => void } {
    const gettext = createPluginGettext(geolibreApp);
    const panelApp = createApp(ArchesPanel);
    panelApp.use(OpenVue, {
        theme: {
            preset: ArchesGeoLibrePreset,
            options: {
                prefix: "arches-geolibre",
                darkModeSelector: ".dark",
            },
        },
    });
    panelApp.use(gettext);
    panelApp.provide(GEOLIBRE_APP_KEY, geolibreApp);
    panelApp.provide(WORKSPACE_KEY, workspace);
    panelApp.provide(
        ARCHES_FETCH_KEY,
        createRefreshingFetch(
            createRetryingFetch(hostFetch(geolibreApp)),
            workspaceSessionStore(geolibreApp, workspace),
        ),
    );
    return {
        panelApp,
        stopFollowingLocale: followGeoLibreLocale(gettext, geolibreApp),
    };
}

/**
 * On desktop, GeoLibre's native HTTP client reaches any Arches instance
 * without CORS configuration; the browser build falls back to window.fetch.
 */
function hostFetch(geolibreApp: GeoLibreAppAPI): typeof fetch {
    return geolibreApp.nativeFetch ?? window.fetch.bind(window);
}
