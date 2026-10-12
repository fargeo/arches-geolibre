import { createApp } from "vue";

import Aura from "@openvue/themes/aura";
import OpenVue from "openvue/config";

import ArchesPanel from "@/arches_geolibre/ArchesPanel.vue";
import { GEOLIBRE_APP_KEY } from "@/arches_geolibre/constants.ts";

import type { App } from "vue";
import type { GeoLibreAppAPI } from "@/arches_geolibre/geolibre/host-api.ts";

/**
 * OpenVue injects its theme as global <style> tags. They stay unlayered: in a
 * cascade layer they would lose to every unlayered rule in GeoLibre's
 * stylesheet, including element resets. Unlayered, OpenVue's class selectors
 * outrank those resets on specificity. The custom prefix keeps OpenVue's CSS
 * variables from colliding with anything else on the page, and dark mode
 * follows the `dark` class GeoLibre toggles on <html>.
 */
export function createPanelApp(geolibreApp: GeoLibreAppAPI): App {
    const panelApp = createApp(ArchesPanel);
    panelApp.use(OpenVue, {
        theme: {
            preset: Aura,
            options: {
                prefix: "arches-geolibre",
                darkModeSelector: ".dark",
            },
        },
    });
    panelApp.provide(GEOLIBRE_APP_KEY, geolibreApp);
    return panelApp;
}
