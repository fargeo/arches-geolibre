import { PANEL_ID, PLUGIN_ID } from "@/arches_geolibre/constants.ts";
import { createPanelApp } from "@/arches_geolibre/create-panel-app.ts";
import { syncWorkspaceOverviewHeaders } from "@/arches_geolibre/utils/arches-session.ts";
import { syncOverviewHeaders } from "@/arches_geolibre/utils/overview-layers.ts";
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
let stopWatchingLayers: (() => void) | null = null;

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
                const { panelApp, disposePanelApp } = createPanelApp(
                    geolibreApp,
                    workspace,
                );
                panelApp.mount(container);
                return () => {
                    disposePanelApp();
                    panelApp.unmount();
                };
            },
        });
        // Overview layers get their sign-in back on reactivation, and drop out
        // of the workspace when the user removes them in GeoLibre.
        syncWorkspaceOverviewHeaders(geolibreApp, workspace);
        stopWatchingLayers =
            geolibreApp.onLayersChanged?.(() =>
                syncWorkspaceOverviewHeaders(geolibreApp, workspace),
            ) ?? null;
        geolibreApp.openRightPanel?.(PANEL_ID);
        return true;
    },

    deactivate(geolibreApp: GeoLibreAppAPI): void {
        unregisterPanel?.();
        unregisterPanel = null;
        stopWatchingLayers?.();
        stopWatchingLayers = null;
        // The token shouldn't outlive the plugin: the overview layers stay on
        // the map, showing what anyone may see, until the plugin is back.
        syncOverviewHeaders(geolibreApp, workspace.overviewLayers, null);
    },

    getProjectState(): unknown {
        return toProjectState(workspace);
    },

    applyProjectState(
        geolibreApp: GeoLibreAppAPI,
        projectState: unknown,
    ): boolean {
        const isApplied = applyProjectState(workspace, projectState);
        if (isApplied) {
            syncWorkspaceOverviewHeaders(geolibreApp, workspace);
        }
        return isApplied;
    },
};

export default plugin;
