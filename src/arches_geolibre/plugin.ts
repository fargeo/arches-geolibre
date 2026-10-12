import { PANEL_ID, PLUGIN_ID } from "@/arches_geolibre/constants.ts";
import { createPanelApp } from "@/arches_geolibre/create-panel-app.ts";
import {
    applyProjectState,
    createArchesWorkspace,
    toProjectState,
} from "@/arches_geolibre/workspace.ts";

import type {
    GeoLibreAppAPI,
    GeoLibrePlugin,
} from "@/arches_geolibre/geolibre/host-api.ts";

const workspace = createArchesWorkspace();
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
                const { panelApp, stopFollowingLocale } = createPanelApp(
                    geolibreApp,
                    workspace,
                );
                panelApp.mount(container);
                return () => {
                    stopFollowingLocale();
                    panelApp.unmount();
                };
            },
        });
        geolibreApp.openRightPanel?.(PANEL_ID);
        return true;
    },

    deactivate(): void {
        unregisterPanel?.();
        unregisterPanel = null;
    },

    getProjectState(): unknown {
        return toProjectState(workspace);
    },

    applyProjectState(
        _geolibreApp: GeoLibreAppAPI,
        projectState: unknown,
    ): boolean {
        return applyProjectState(workspace, projectState);
    },
};

export default plugin;
