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

import { buildArchesLayerStyle } from "@/arches_geolibre/utils/layer-style.ts";

import type { Feature, Geometry, Position } from "geojson";
import type { GeoLibreAppAPI } from "@/arches_geolibre/geolibre/host-api.ts";
import type {
    ArchesGeometryNode,
    ArchesLayerSource,
    ArchesSession,
    LoadedArchesLayer,
} from "@/arches_geolibre/types.ts";

export interface PushResult {
    savedTileCount: number;
    provisionalTileCount: number;
    createdResourceIds: string[];
    failures: string[];
}

export interface LoadArchesLayerOptions {
    source: ArchesLayerSource;
    isWritable: boolean;
    signal?: AbortSignal;
}

export function archesSourcePath(
    session: ArchesSession,
    nodeId: string,
    source: ArchesLayerSource,
): string {
    const host = new URL(session.instanceUrl).host;
    return source.kind === "spatial-view"
        ? `arches://${host}/spatialviews/${source.slug}`
        : `arches://${host}/nodes/${nodeId}`;
}

export function archesLayerName(
    node: ArchesGeometryNode,
    source: ArchesLayerSource,
): string {
    return source.kind === "spatial-view"
        ? source.slug
        : `${node.resourcemodelname}: ${node.name}`;
}

/**
 * Loads a geometry node into a new GeoLibre layer, styled as Arches styles
 * it, and zooms to it. A spatial view loads its geometry node: on 8.1 there
 * is no endpoint that reads a view's attribute columns.
 */
export async function loadArchesLayer(
    geolibreApp: GeoLibreAppAPI,
    fetchImplementation: typeof fetch,
    session: ArchesSession,
    node: ArchesGeometryNode,
    options: LoadArchesLayerOptions,
): Promise<LoadedArchesLayer> {
    const taggedCollection = tagArchesFeatures(
        await fetchNodeFeatures(fetchImplementation, session, node.nodeid, {
            signal: options.signal,
        }),
    );
    const layerId = geolibreApp.addGeoJsonLayer(
        archesLayerName(node, options.source),
        taggedCollection,
        archesSourcePath(session, node.nodeid, options.source),
    );
    const styleResult = geolibreApp.importLayerStyle?.(
        layerId,
        buildArchesLayerStyle(node.config),
    );
    if (styleResult && !styleResult.ok) {
        console.warn(
            `[arches-geolibre] GeoLibre did not apply the Arches style (${styleResult.reason}).`,
            styleResult.warnings,
        );
    }
    const bounds = featureBounds(taggedCollection.features);
    if (bounds) {
        geolibreApp.fitBounds?.(bounds);
    }
    return {
        layerId,
        node,
        source: options.source,
        isWritable: options.isWritable,
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
    loadedLayer: Pick<LoadedArchesLayer, "layerId" | "node" | "source"> &
        Partial<Pick<LoadedArchesLayer, "isWritable">>,
): Promise<LoadedArchesLayer> {
    const reloadedLayer = await loadArchesLayer(
        geolibreApp,
        fetchImplementation,
        session,
        loadedLayer.node,
        {
            source: loadedLayer.source,
            isWritable: loadedLayer.isWritable ?? true,
        },
    );
    removeLayer(geolibreApp, loadedLayer.layerId);
    return reloadedLayer;
}

/**
 * The plugin API has no removeLayer. In GeoLibre 3.4.0
 * unregisterExternalNativeLayer removes any layer by id; this is the only
 * place the plugin relies on that.
 */
export function removeLayer(
    geolibreApp: GeoLibreAppAPI,
    layerId: string,
): void {
    geolibreApp.unregisterExternalNativeLayer?.(layerId);
}

export function featureBounds(
    features: Feature<Geometry | null>[],
): [number, number, number, number] | null {
    let west = Infinity;
    let south = Infinity;
    let east = -Infinity;
    let north = -Infinity;
    for (const feature of features) {
        for (const [longitude, latitude] of positionsOf(feature.geometry)) {
            west = Math.min(west, longitude);
            south = Math.min(south, latitude);
            east = Math.max(east, longitude);
            north = Math.max(north, latitude);
        }
    }
    return Number.isFinite(west) ? [west, south, east, north] : null;
}

function* positionsOf(geometry: Geometry | null): Generator<Position> {
    if (!geometry) {
        return;
    }
    if (geometry.type === "GeometryCollection") {
        for (const memberGeometry of geometry.geometries) {
            yield* positionsOf(memberGeometry);
        }
        return;
    }
    yield* flattenPositions(geometry.coordinates);
}

function* flattenPositions(coordinates: unknown): Generator<Position> {
    if (!Array.isArray(coordinates)) {
        return;
    }
    if (typeof coordinates[0] === "number") {
        yield coordinates as Position;
        return;
    }
    for (const nestedCoordinates of coordinates) {
        yield* flattenPositions(nestedCoordinates);
    }
}
