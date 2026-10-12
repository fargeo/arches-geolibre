import {
    fetchNodeFeatures,
    saveTileGeometry,
} from "@/arches_geolibre/utils/arches-client.ts";
import { detectFeatureChanges } from "@/arches_geolibre/utils/change-detection.ts";
import {
    readTileId,
    tagArchesFeatures,
} from "@/arches_geolibre/utils/feature-keys.ts";
import {
    buildChangedTileCollections,
    toArchesTileFeature,
} from "@/arches_geolibre/utils/tile-collections.ts";

import type { GeoLibreAppAPI } from "@/arches_geolibre/geolibre/host-api.ts";
import type {
    ArchesGeometryNode,
    ArchesSession,
    LoadedArchesLayer,
} from "@/arches_geolibre/types.ts";

export interface PushResult {
    savedTileCount: number;
    provisionalTileCount: number;
    createdResourceIds: string[];
    failures: string[];
}

export function archesSourcePath(
    session: ArchesSession,
    nodeId: string,
): string {
    return `arches://${new URL(session.instanceUrl).host}/nodes/${nodeId}`;
}

export async function loadArchesLayer(
    geolibreApp: GeoLibreAppAPI,
    fetchImplementation: typeof fetch,
    session: ArchesSession,
    node: ArchesGeometryNode,
    isWritable: boolean,
): Promise<LoadedArchesLayer> {
    const taggedCollection = tagArchesFeatures(
        await fetchNodeFeatures(fetchImplementation, session, node.nodeid),
    );
    const layerId = geolibreApp.addGeoJsonLayer(
        `${node.resourcemodelname}: ${node.name}`,
        taggedCollection,
        archesSourcePath(session, node.nodeid),
    );
    return {
        layerId,
        node,
        isWritable,
        baselineFeatures: structuredClone(taggedCollection.features),
    };
}

/**
 * Writes a layer's pending changes to Arches. Edits, deletions, and copies or
 * split-off parts of existing features are saved by rewriting their tile's
 * collection; each freshly drawn feature becomes a new resource holding only
 * that geometry, for the user to finish in Arches.
 * All writes share one edit-log transaction so they can be reversed together.
 */
export async function pushLayerChanges(
    geolibreApp: GeoLibreAppAPI,
    fetchImplementation: typeof fetch,
    session: ArchesSession,
    loadedLayer: LoadedArchesLayer,
): Promise<PushResult> {
    const currentFeatures =
        geolibreApp.getLayerFeatures?.(loadedLayer.layerId) ?? [];
    const changes = detectFeatureChanges(
        loadedLayer.baselineFeatures,
        currentFeatures,
    );
    const transactionId = crypto.randomUUID();
    const result: PushResult = {
        savedTileCount: 0,
        provisionalTileCount: 0,
        createdResourceIds: [],
        failures: [],
    };

    const tileCollections = buildChangedTileCollections(
        currentFeatures,
        changes,
    );
    for (const [tileId, featureCollection] of tileCollections) {
        try {
            await saveTileGeometry(fetchImplementation, session, {
                nodeId: loadedLayer.node.nodeid,
                tileId,
                featureCollection,
                transactionId,
            });
            result.savedTileCount += 1;
        } catch (error) {
            result.failures.push(`Tile ${tileId}: ${String(error)}`);
        }
    }

    for (const change of changes) {
        const isFreshlyDrawn =
            change.kind === "created" && readTileId(change.feature) === null;
        if (!isFreshlyDrawn || change.feature.geometry === null) {
            continue;
        }
        try {
            const savedTile = await saveTileGeometry(
                fetchImplementation,
                session,
                {
                    nodeId: loadedLayer.node.nodeid,
                    featureCollection: {
                        type: "FeatureCollection",
                        features: [toArchesTileFeature(change.feature)],
                    },
                    transactionId,
                },
            );
            result.createdResourceIds.push(savedTile.resourceinstance_id);
        } catch (error) {
            result.failures.push(`New feature: ${String(error)}`);
        }
    }

    // Arches saves edits by users outside Resource Reviewer as provisional:
    // the tile keeps its approved data until a reviewer accepts the edit, and
    // /geojson only returns approved data.
    if (!session.isReviewer) {
        result.provisionalTileCount =
            result.savedTileCount + result.createdResourceIds.length;
    }
    return result;
}

/**
 * Splits and copies leave the layer holding duplicate feature keys, so after a
 * push the layer is replaced with a fresh load from Arches rather than
 * re-baselined in place.
 */
export async function reloadArchesLayer(
    geolibreApp: GeoLibreAppAPI,
    fetchImplementation: typeof fetch,
    session: ArchesSession,
    loadedLayer: LoadedArchesLayer,
): Promise<LoadedArchesLayer> {
    const reloadedLayer = await loadArchesLayer(
        geolibreApp,
        fetchImplementation,
        session,
        loadedLayer.node,
        loadedLayer.isWritable,
    );
    geolibreApp.unregisterExternalNativeLayer?.(loadedLayer.layerId);
    return reloadedLayer;
}
