import { computed } from "vue";

import { useArchesWorkspace } from "@/arches_geolibre/composables/use-arches-workspace.ts";
import {
    useArchesFetch,
    useGeoLibreApp,
} from "@/arches_geolibre/composables/use-geolibre-app.ts";
import {
    fetchCanEditResource,
    fetchGeometryByResource,
} from "@/arches_geolibre/utils/arches-client.ts";
import {
    featureBounds,
    loadArchesLayer,
    removeLayer,
    replaceArchesLayerFeatures,
} from "@/arches_geolibre/utils/arches-layers.ts";
import { copyFeaturesForArches } from "@/arches_geolibre/utils/copy-features.ts";
import { isLayerBeingEdited } from "@/arches_geolibre/utils/edit-sessions.ts";
import { tagArchesFeatures } from "@/arches_geolibre/utils/feature-keys.ts";
import { affectedResourceId } from "@/arches_geolibre/utils/push-plan.ts";
import {
    addToWorklist,
    createWorklist,
    currentEntry,
    updateEntries,
} from "@/arches_geolibre/utils/worklist.ts";

import type { Feature, Geometry } from "geojson";
import type {
    ArchesGeometryNode,
    LoadedArchesLayer,
} from "@/arches_geolibre/types.ts";

// About 150 m: fitting the map to a point would otherwise keep the zoom.
const MINIMUM_ZOOM_TO_SPAN_DEGREES = 0.002;

function withMinimumSize([west, south, east, north]: [
    number,
    number,
    number,
    number,
]): [number, number, number, number] {
    const longitudePadding = Math.max(
        0,
        (MINIMUM_ZOOM_TO_SPAN_DEGREES - (east - west)) / 2,
    );
    const latitudePadding = Math.max(
        0,
        (MINIMUM_ZOOM_TO_SPAN_DEGREES - (north - south)) / 2,
    );
    return [
        west - longitudePadding,
        south - latitudePadding,
        east + longitudePadding,
        north + latitudePadding,
    ];
}

export class LayerBeingEditedError extends Error {
    constructor() {
        super("Finish editing the worklist layer first.");
        this.name = "LayerBeingEditedError";
    }
}

/**
 * The resource-first workflow: a worklist of resources, picked whether or
 * not they have geometry, with a layer holding the geometry they do have.
 * New geometry drawn on that layer, or copied into it, goes to the current
 * resource.
 */
export function useWorklist() {
    const workspace = useArchesWorkspace();
    const geolibreApp = useGeoLibreApp();
    const archesFetch = useArchesFetch();

    const worklist = computed(() => workspace.worklist);
    const worklistLayer = computed(() =>
        workspace.loadedLayers.find(
            (loadedLayer) => loadedLayer.key === workspace.worklist?.layerKey,
        ),
    );
    const current = computed(() =>
        workspace.worklist ? currentEntry(workspace.worklist) : null,
    );
    /** Resources with included changes on the worklist layer, not yet pushed. */
    const resourceIdsWithPendingChanges = computed(() => {
        const layerKey = workspace.worklist?.layerKey;
        const pendingChanges = layerKey
            ? (workspace.pendingChangesByLayerKey[layerKey] ?? [])
            : [];
        return new Set(
            pendingChanges
                .filter((pendingChange) => pendingChange.isIncluded)
                .map(affectedResourceId)
                .filter(
                    (resourceInstanceId): resourceInstanceId is string =>
                        resourceInstanceId !== null,
                ),
        );
    });

    function requireSession() {
        if (!workspace.session) {
            throw new Error("Sign in to Arches first.");
        }
        return workspace.session;
    }

    async function start(node: ArchesGeometryNode): Promise<void> {
        const session = requireSession();
        const loadedLayer = await loadArchesLayer(
            geolibreApp,
            archesFetch,
            session,
            node,
            {
                source: { kind: "worklist", resourceInstanceIds: [] },
                isWritable: true,
            },
        );
        workspace.loadedLayers.push(loadedLayer);
        workspace.worklist = {
            ...createWorklist(node),
            layerKey: loadedLayer.key,
        };
    }

    /**
     * Adds resources to the worklist, and their existing geometry, if any,
     * to the worklist layer so it can be edited.
     */
    async function addResources(
        candidates: { resourceInstanceId: string; name: string }[],
    ): Promise<void> {
        const session = requireSession();
        const startingWorklist = workspace.worklist;
        const loadedLayer = worklistLayer.value;
        if (!startingWorklist || !loadedLayer) {
            return;
        }
        const knownResourceIds = new Set(
            startingWorklist.entries.map((entry) => entry.resourceInstanceId),
        );
        const newCandidates = candidates.filter(
            (candidate) => !knownResourceIds.has(candidate.resourceInstanceId),
        );
        if (newCandidates.length === 0) {
            return;
        }
        const newResourceIds = newCandidates.map(
            (candidate) => candidate.resourceInstanceId,
        );
        const geometryByResource = await fetchGeometryByResource(
            archesFetch,
            session,
            startingWorklist.node.nodeid,
            newResourceIds,
        );
        const newFeatures = [...geometryByResource.values()].flat();
        if (
            newFeatures.length > 0 &&
            isLayerBeingEdited(geolibreApp, loadedLayer.layerId)
        ) {
            throw new LayerBeingEditedError();
        }

        workspace.worklist = addToWorklist(
            startingWorklist,
            newCandidates.map((candidate) => ({
                ...candidate,
                hasGeometry: geometryByResource.has(
                    candidate.resourceInstanceId,
                ),
            })),
        );
        const source = {
            kind: "worklist" as const,
            resourceInstanceIds: [
                ...(loadedLayer.source.kind === "worklist"
                    ? loadedLayer.source.resourceInstanceIds
                    : []),
                ...newResourceIds,
            ],
        };
        if (newFeatures.length > 0) {
            const taggedFeatures = tagArchesFeatures({
                type: "FeatureCollection",
                features: newFeatures,
            }).features;
            replaceLoadedLayer(
                replaceArchesLayerFeatures(geolibreApp, session, loadedLayer, {
                    features: [
                        ...currentFeatures(loadedLayer),
                        ...taggedFeatures,
                    ],
                    baselineFeatures: [
                        ...loadedLayer.baselineFeatures,
                        ...structuredClone(taggedFeatures),
                    ],
                    source,
                }),
            );
        } else {
            replaceLoadedLayer({ ...loadedLayer, source });
        }
        await learnEditPermissions(newResourceIds);
    }

    async function learnEditPermissions(
        resourceInstanceIds: string[],
    ): Promise<void> {
        const session = requireSession();
        const answers = await Promise.all(
            resourceInstanceIds.map((resourceInstanceId) =>
                fetchCanEditResource(
                    archesFetch,
                    session,
                    resourceInstanceId,
                ).catch(() => false),
            ),
        );
        for (const canEdit of [true, false]) {
            const matchingIds = resourceInstanceIds.filter(
                (_resourceInstanceId, index) => answers[index] === canEdit,
            );
            if (workspace.worklist && matchingIds.length > 0) {
                workspace.worklist = updateEntries(
                    workspace.worklist,
                    matchingIds,
                    { canEdit },
                );
            }
        }
    }

    /**
     * Copies features selected in another GeoLibre layer into the worklist
     * layer. They're detected as new drawings, so they go to the current
     * resource.
     */
    function copyFeatures(features: Feature<Geometry | null>[]): {
        copiedCount: number;
        skippedCount: number;
    } {
        const session = requireSession();
        const loadedLayer = worklistLayer.value;
        if (!loadedLayer) {
            return { copiedCount: 0, skippedCount: features.length };
        }
        if (isLayerBeingEdited(geolibreApp, loadedLayer.layerId)) {
            throw new LayerBeingEditedError();
        }
        const { copies, skippedCount } = copyFeaturesForArches(features);
        if (copies.length > 0) {
            replaceLoadedLayer(
                replaceArchesLayerFeatures(geolibreApp, session, loadedLayer, {
                    features: [...currentFeatures(loadedLayer), ...copies],
                }),
            );
        }
        return { copiedCount: copies.length, skippedCount };
    }

    function zoomToCurrent(): void {
        const loadedLayer = worklistLayer.value;
        const resourceInstanceId = current.value?.resourceInstanceId;
        if (!loadedLayer || !resourceInstanceId) {
            return;
        }
        const bounds = featureBounds(
            currentFeatures(loadedLayer).filter(
                (feature) =>
                    feature.properties?.resourceinstanceid ===
                    resourceInstanceId,
            ),
        );
        if (bounds) {
            geolibreApp.fitBounds?.(withMinimumSize(bounds));
        }
    }

    /**
     * Opens the GeoEditor on the worklist layer, zoomed to the current
     * resource if it has geometry. Needs GeoLibre's startEditSession
     * (opengeos/GeoLibre#3138); resolves false when the editor can't open.
     */
    async function editCurrentGeometry(): Promise<boolean> {
        const loadedLayer = worklistLayer.value;
        if (!loadedLayer || !geolibreApp.startEditSession) {
            return false;
        }
        if (current.value?.hasGeometry) {
            zoomToCurrent();
        }
        return geolibreApp.startEditSession(loadedLayer.layerId);
    }

    /** Ends the worklist, removing its layer and any unpushed changes. */
    function finish(): void {
        const layerKey = workspace.worklist?.layerKey;
        const loadedLayer = worklistLayer.value;
        if (loadedLayer) {
            removeLayer(geolibreApp, loadedLayer.layerId);
        }
        workspace.loadedLayers = workspace.loadedLayers.filter(
            (candidate) => candidate.key !== layerKey,
        );
        if (layerKey) {
            const { [layerKey]: _removed, ...remaining } =
                workspace.pendingChangesByLayerKey;
            workspace.pendingChangesByLayerKey = remaining;
        }
        workspace.worklist = null;
    }

    function currentFeatures(
        loadedLayer: LoadedArchesLayer,
    ): Feature<Geometry | null>[] {
        return geolibreApp.getLayerFeatures?.(loadedLayer.layerId) ?? [];
    }

    // GeoLibre hides a layer while it's being edited, and the plugin API
    // offers no other sign; replacing the layer then would lose the edits.
    function replaceLoadedLayer(updatedLayer: LoadedArchesLayer): void {
        workspace.loadedLayers = workspace.loadedLayers.map((candidate) =>
            candidate.key === updatedLayer.key ? updatedLayer : candidate,
        );
    }

    return {
        worklist,
        worklistLayer,
        current,
        resourceIdsWithPendingChanges,
        start,
        addResources,
        copyFeatures,
        zoomToCurrent,
        canEditInPlace: geolibreApp.startEditSession !== undefined,
        editCurrentGeometry,
        finish,
    };
}
