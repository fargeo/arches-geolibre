import { reactive } from "vue";

import type { TrackedReviewTile } from "@/arches_geolibre/utils/pending-review.ts";
import type { PendingChange } from "@/arches_geolibre/utils/push-plan.ts";
import type { Worklist } from "@/arches_geolibre/utils/worklist.ts";
import type {
    ArchesGeometryNode,
    ArchesLayerSource,
    ArchesSession,
    LoadedArchesLayer,
} from "@/arches_geolibre/types.ts";

/** An Arches layer recorded in a GeoLibre project, saved without credentials. */
export interface SavedArchesLayer {
    key?: string;
    layerId: string;
    node: ArchesGeometryNode;
    source: ArchesLayerSource;
}

interface ArchesProjectState {
    instanceUrl: string;
    layers: SavedArchesLayer[];
    worklist?: Worklist | null;
}

/**
 * The plugin's state, shared by the panel and the plugin object: GeoLibre
 * asks the plugin (not the panel) for project state, and may apply a project
 * before the panel has ever been opened.
 */
export interface ArchesWorkspace {
    session: ArchesSession | null;
    /** Whether the session is kept in GeoLibre's credential store. */
    isSessionSaved: boolean;
    /** The session ended because Arches refused to refresh it. */
    hasSessionExpired: boolean;
    loadedLayers: LoadedArchesLayer[];
    /** The project's instance, kept until the user signs in to it. */
    projectInstanceUrl: string | null;
    /** Layers from an opened project, awaiting a reload from Arches. */
    savedLayers: SavedArchesLayer[];
    /** Tiles holding the signed-in user's edits that await review. */
    trackedReviewTiles: TrackedReviewTile[];
    /** The read-only layer drawing those edits. */
    awaitingReviewLayerId: string | null;
    /** Each loaded layer's pending changes, by the layer's key. */
    pendingChangesByLayerKey: Record<string, PendingChange[]>;
    worklist: Worklist | null;
}

export function createArchesWorkspace(): ArchesWorkspace {
    return reactive({
        session: null,
        isSessionSaved: false,
        hasSessionExpired: false,
        loadedLayers: [],
        projectInstanceUrl: null,
        savedLayers: [],
        trackedReviewTiles: [],
        awaitingReviewLayerId: null,
        pendingChangesByLayerKey: {},
        worklist: null,
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
        ({ key, layerId, node, source }) => ({ key, layerId, node, source }),
    );
    return {
        instanceUrl,
        layers: [...loadedLayers, ...workspace.savedLayers],
        worklist: workspace.worklist,
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
    workspace.pendingChangesByLayerKey = {};
    workspace.worklist = projectState.worklist ?? null;
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
