import { PANEL_ID, PLUGIN_ID } from "@/arches_geolibre/constants.ts";
import { createPanelApp } from "@/arches_geolibre/create-panel-app.ts";

import type {
    GeoLibreAppAPI,
    GeoLibrePlugin,
} from "@/arches_geolibre/geolibre/host-api.ts";

let unregisterPanel: (() => void) | null = null;

export const plugin: GeoLibrePlugin = {
    id: PLUGIN_ID,
    name: "Arches",
    version: "0.0.1",
    engines: ["maplibre"],

    activate(geolibreApp: GeoLibreAppAPI): boolean {
        if (!geolibreApp.registerRightPanel) {
            return false;
        }
        unregisterPanel = geolibreApp.registerRightPanel({
            id: PANEL_ID,
            title: "Arches",
            dock: "right-of-layers",
            deactivatePluginOnClose: true,
            render(container: HTMLElement): () => void {
                const panelApp = createPanelApp(geolibreApp);
                panelApp.mount(container);
                return () => panelApp.unmount();
            },
        });
        geolibreApp.openRightPanel?.(PANEL_ID);
        return true;
    },

    deactivate(): void {
        unregisterPanel?.();
        unregisterPanel = null;
    },
};

export default plugin;
