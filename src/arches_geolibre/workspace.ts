import { reactive } from "vue";

import type {
    ArchesGeometryNode,
    ArchesLayerSource,
    ArchesSession,
    LoadedArchesLayer,
} from "@/arches_geolibre/types.ts";

/** An Arches layer recorded in a GeoLibre project, saved without credentials. */
export interface SavedArchesLayer {
    layerId: string;
    node: ArchesGeometryNode;
    source: ArchesLayerSource;
}

interface ArchesProjectState {
    instanceUrl: string;
    layers: SavedArchesLayer[];
}

/**
 * The plugin's state, shared by the panel and the plugin object: GeoLibre
 * asks the plugin (not the panel) for project state, and may apply a project
 * before the panel has ever been opened.
 */
export interface ArchesWorkspace {
    session: ArchesSession | null;
    loadedLayers: LoadedArchesLayer[];
    /** The project's instance, kept until the user signs in to it. */
    projectInstanceUrl: string | null;
    /** Layers from an opened project, awaiting a reload from Arches. */
    savedLayers: SavedArchesLayer[];
}

export function createArchesWorkspace(): ArchesWorkspace {
    return reactive({
        session: null,
        loadedLayers: [],
        projectInstanceUrl: null,
        savedLayers: [],
    });
}

export function toProjectState(
    workspace: ArchesWorkspace,
): ArchesProjectState | null {
    const instanceUrl =
        workspace.session?.instanceUrl ?? workspace.projectInstanceUrl;
    if (!instanceUrl) {
        return null;
    }
    const loadedLayers = workspace.loadedLayers.map(
        ({ layerId, node, source }) => ({ layerId, node, source }),
    );
    return {
        instanceUrl,
        layers: [...loadedLayers, ...workspace.savedLayers],
    };
}

export function applyProjectState(
    workspace: ArchesWorkspace,
    projectState: unknown,
): boolean {
    if (!isArchesProjectState(projectState)) {
        return false;
    }
    workspace.projectInstanceUrl = projectState.instanceUrl;
    workspace.loadedLayers = [];
    workspace.savedLayers = projectState.layers;
    return true;
}

function isArchesProjectState(value: unknown): value is ArchesProjectState {
    const candidate = value as Partial<ArchesProjectState> | null;
    return (
        typeof candidate?.instanceUrl === "string" &&
        Array.isArray(candidate.layers) &&
        candidate.layers.every(
            (layer) =>
                typeof layer?.layerId === "string" &&
                typeof layer?.node?.nodeid === "string",
        )
    );
}
