import {
    deleteTile,
    fetchEmptyGeometryTileId,
    fetchNodeFeatures,
    fetchTile,
    saveTileGeometry,
} from "@/arches_geolibre/utils/arches-client.ts";
import { tagArchesFeatures } from "@/arches_geolibre/utils/feature-keys.ts";
import { buildArchesLayerStyle } from "@/arches_geolibre/utils/layer-style.ts";
import {
    affectedResourceId,
    buildPushOperations,
    isFreshlyDrawn,
} from "@/arches_geolibre/utils/push-plan.ts";
import {
    loadedTileFeatures,
    tileMatchesLoadedFeatures,
} from "@/arches_geolibre/utils/tile-conflicts.ts";

import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import type { GeoLibreAppAPI } from "@/arches_geolibre/geolibre/host-api.ts";
import type { TileConflict } from "@/arches_geolibre/utils/tile-conflicts.ts";
import type {
    PendingChange,
    PushOperation,
} from "@/arches_geolibre/utils/push-plan.ts";
import type {
    ArchesGeometryNode,
    ArchesLayerSource,
    ArchesSession,
    LoadedArchesLayer,
} from "@/arches_geolibre/types.ts";

export interface PushResult {
    savedTileCount: number;
    deletedTileCount: number;
    /** Tiles whose geometry was cleared because they couldn't be deleted. */
    clearedTileCount: number;
    createdResourceIds: string[];
    /** Tiles whose changes await review: the user isn't a Resource Reviewer. */
    provisionalTileIds: string[];
    /** Tiles skipped because they changed in Arches after the layer loaded. */
    conflicts: TileConflict[];
    failures: PushFailure[];
}

export interface PushFailure {
    resourceInstanceId: string | null;
    resourceName: string | null;
    isNewResource: boolean;
    error: unknown;
}

export interface LoadArchesLayerOptions {
    source: ArchesLayerSource;
    isWritable: boolean;
    /** Keeps a reloaded layer's identity; a new layer gets a new key. */
    key?: string;
    signal?: AbortSignal;
    onBytesReceived?: (byteCount: number) => void;
}

/**
 * Under default-deny, /geojson's permission filter reads the search index,
 * which makes writes visible within about a second.
 */
const SEARCH_INDEX_REFRESH_MILLISECONDS = 1500;

export function archesSourcePath(
    session: ArchesSession,
    nodeId: string,
    source: ArchesLayerSource,
): string {
    const host = new URL(session.instanceUrl).host;
    switch (source.kind) {
        case "spatial-view":
            return `arches://${host}/spatialviews/${source.slug}`;
        case "worklist":
            return `arches://${host}/nodes/${nodeId}/worklist`;
        default:
            return `arches://${host}/nodes/${nodeId}`;
    }
}

export function archesLayerName(
    node: ArchesGeometryNode,
    source: ArchesLayerSource,
): string {
    switch (source.kind) {
        case "spatial-view":
            return source.slug;
        case "worklist":
            return `${node.resourcemodelname}: ${node.name} (worklist)`;
        default:
            return `${node.resourcemodelname}: ${node.name}`;
    }
}

/**
 * Loads a geometry node into a new GeoLibre layer, styled as Arches styles
 * it, and zooms to it. A spatial view loads its geometry node: no Arches
 * endpoint reads a view's attribute columns yet. A worklist layer loads only
 * its resources' geometry, which may be none at all.
 */
export async function loadArchesLayer(
    geolibreApp: GeoLibreAppAPI,
    fetchImplementation: typeof fetch,
    session: ArchesSession,
    node: ArchesGeometryNode,
    options: LoadArchesLayerOptions,
): Promise<LoadedArchesLayer> {
    const taggedCollection = tagArchesFeatures(
        await fetchSourceFeatures(fetchImplementation, session, node, options),
    );
    const layerId = addStyledLayer(
        geolibreApp,
        session,
        node,
        options.source,
        taggedCollection.features,
    );
    const bounds = featureBounds(taggedCollection.features);
    if (bounds) {
        geolibreApp.fitBounds?.(bounds);
    }
    return {
        key: options.key ?? crypto.randomUUID(),
        layerId,
        node,
        source: options.source,
        isWritable: options.isWritable,
        baselineFeatures: structuredClone(taggedCollection.features),
        contentRevision: 0,
    };
}

function fetchSourceFeatures(
    fetchImplementation: typeof fetch,
    session: ArchesSession,
    node: ArchesGeometryNode,
    options: LoadArchesLayerOptions,
): Promise<FeatureCollection<Geometry>> {
    if (options.source.kind === "worklist") {
        const { resourceInstanceIds } = options.source;
        return resourceInstanceIds.length === 0
            ? Promise.resolve({ type: "FeatureCollection", features: [] })
            : fetchNodeFeatures(fetchImplementation, session, node.nodeid, {
                  resourceInstanceIds,
                  signal: options.signal,
              });
    }
    return fetchNodeFeatures(fetchImplementation, session, node.nodeid, {
        signal: options.signal,
        onBytesReceived: options.onBytesReceived,
    });
}

function addStyledLayer(
    geolibreApp: GeoLibreAppAPI,
    session: ArchesSession,
    node: ArchesGeometryNode,
    source: ArchesLayerSource,
    features: Feature<Geometry | null>[],
): string {
    const layerId = geolibreApp.addGeoJsonLayer(
        archesLayerName(node, source),
        { type: "FeatureCollection", features } as FeatureCollection,
        archesSourcePath(session, node.nodeid, source),
    );
    applyArchesStyle(geolibreApp, layerId, node);
    return layerId;
}

/** Styles a GeoLibre layer as Arches styles the node. */
export function applyArchesStyle(
    geolibreApp: GeoLibreAppAPI,
    layerId: string,
    node: ArchesGeometryNode,
): void {
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
}

/**
 * Swaps a layer's features without a round trip to Arches, keeping its key
 * so its pending changes carry over. Hosts with updateGeoJsonLayer keep the
 * same GeoLibre layer; older ones get a replacement layer.
 */
export function replaceArchesLayerFeatures(
    geolibreApp: GeoLibreAppAPI,
    session: ArchesSession,
    loadedLayer: LoadedArchesLayer,
    update: {
        features: Feature<Geometry | null>[];
        baselineFeatures?: Feature<Geometry | null>[];
        source?: ArchesLayerSource;
    },
): LoadedArchesLayer {
    const source = update.source ?? loadedLayer.source;
    const layerId = replaceLayerContent(
        geolibreApp,
        session,
        loadedLayer,
        source,
        update.features,
    );
    return {
        ...loadedLayer,
        layerId,
        source,
        baselineFeatures:
            update.baselineFeatures ?? loadedLayer.baselineFeatures,
        contentRevision: loadedLayer.contentRevision + 1,
    };
}

/**
 * Writes a layer's included pending changes to Arches, all in one edit-log
 * transaction so they can be reversed together.
 *
 * A tile left with no geometry is deleted where Arches allows it (reviewers,
 * on an instance with tile deletion in its API); otherwise its geometry is
 * cleared. Edits by users outside Resource Reviewer are saved as provisional.
 */
export async function pushLayerChanges(
    geolibreApp: GeoLibreAppAPI,
    fetchImplementation: typeof fetch,
    session: ArchesSession,
    loadedLayer: LoadedArchesLayer,
    pendingChanges: PendingChange[],
): Promise<PushResult> {
    const currentFeatures =
        geolibreApp.getLayerFeatures?.(loadedLayer.layerId) ?? [];
    const existingFeatures = await fetchAttachTargetFeatures(
        fetchImplementation,
        session,
        loadedLayer.node,
        currentFeatures,
        pendingChanges,
    );
    const operations = buildPushOperations({
        baselineFeatures: loadedLayer.baselineFeatures,
        currentFeatures,
        pendingChanges,
        existingFeatures,
    });

    const transactionId = crypto.randomUUID();
    const result: PushResult = {
        savedTileCount: 0,
        deletedTileCount: 0,
        clearedTileCount: 0,
        createdResourceIds: [],
        provisionalTileIds: [],
        conflicts: [],
        failures: [],
    };
    const loadedFeatures = [
        ...loadedLayer.baselineFeatures,
        ...existingFeatures,
    ];
    const nodeId = loadedLayer.node.nodeid;

    for (const operation of operations) {
        try {
            if (
                (operation.kind === "save-tile" ||
                    operation.kind === "delete-tile") &&
                (await findConflict(
                    fetchImplementation,
                    session,
                    nodeId,
                    operation.tileId,
                    loadedFeatures,
                    result,
                ))
            ) {
                continue;
            }
            if (operation.kind === "delete-tile") {
                const isDeleted =
                    session.isReviewer &&
                    (await deleteTile(
                        fetchImplementation,
                        session,
                        operation.tileId,
                    ));
                if (isDeleted) {
                    result.deletedTileCount += 1;
                    continue;
                }
                await saveTileGeometry(fetchImplementation, session, {
                    nodeId,
                    tileId: operation.tileId,
                    featureCollection: {
                        type: "FeatureCollection",
                        features: [],
                    },
                    transactionId,
                });
                result.clearedTileCount += 1;
                recordProvisional(result, session, operation.tileId);
                continue;
            }

            const emptyTileId =
                operation.kind === "add-tile"
                    ? await fetchEmptyGeometryTileId(
                          fetchImplementation,
                          session,
                          operation.resourceInstanceId,
                          loadedLayer.node,
                      )
                    : null;
            const savedTile = await saveTileGeometry(
                fetchImplementation,
                session,
                {
                    nodeId,
                    featureCollection: operation.featureCollection,
                    transactionId,
                    ...(operation.kind === "save-tile" && {
                        tileId: operation.tileId,
                    }),
                    ...(operation.kind === "add-tile" &&
                        (emptyTileId
                            ? { tileId: emptyTileId }
                            : {
                                  resourceInstanceId:
                                      operation.resourceInstanceId,
                              })),
                },
            );
            if (operation.kind === "create-resource") {
                result.createdResourceIds.push(savedTile.resourceinstance_id);
            } else {
                result.savedTileCount += 1;
            }
            recordProvisional(result, session, savedTile.tileid);
        } catch (error) {
            result.failures.push(
                toPushFailure(operation, loadedFeatures, error),
            );
        }
    }
    return result;
}

/**
 * A drawn feature attached to a resource that isn't on the map must join that
 * resource's existing tile without dropping the features already in it, so
 * those features are fetched first.
 */
async function fetchAttachTargetFeatures(
    fetchImplementation: typeof fetch,
    session: ArchesSession,
    node: ArchesGeometryNode,
    currentFeatures: Feature<Geometry | null>[],
    pendingChanges: PendingChange[],
): Promise<Feature<Geometry | null>[]> {
    const resourceIdsOnMap = new Set(
        currentFeatures.map(
            (feature) => feature.properties?.resourceinstanceid,
        ),
    );
    const resourceIdsToFetch = [
        ...new Set(
            pendingChanges
                .filter(
                    (pendingChange) =>
                        pendingChange.isIncluded &&
                        isFreshlyDrawn(pendingChange.change),
                )
                .map(affectedResourceId)
                .filter(
                    (resourceInstanceId): resourceInstanceId is string =>
                        resourceInstanceId !== null &&
                        !resourceIdsOnMap.has(resourceInstanceId),
                ),
        ),
    ];
    if (resourceIdsToFetch.length === 0) {
        return [];
    }
    const featureCollection = await fetchNodeFeatures(
        fetchImplementation,
        session,
        node.nodeid,
        { resourceInstanceIds: resourceIdsToFetch },
    );
    return tagArchesFeatures(featureCollection).features;
}

/**
 * Re-reads a tile before overwriting it. If it changed in Arches since the
 * layer loaded, or is gone, records a conflict so the write is skipped:
 * a push never overwrites someone else's work.
 */
async function findConflict(
    fetchImplementation: typeof fetch,
    session: ArchesSession,
    nodeId: string,
    tileId: string,
    loadedFeatures: Feature<Geometry | null>[],
    result: PushResult,
): Promise<boolean> {
    const loadedTile = loadedTileFeatures(loadedFeatures, tileId);
    const storedTile = await fetchTile(fetchImplementation, session, tileId);
    const isUnchanged =
        storedTile !== null &&
        tileMatchesLoadedFeatures(
            storedTile.data[nodeId] as FeatureCollection<Geometry> | null,
            loadedTile.features,
        );
    if (!isUnchanged) {
        result.conflicts.push(loadedTile.conflict);
    }
    return !isUnchanged;
}

function recordProvisional(
    result: PushResult,
    session: ArchesSession,
    tileId: string,
): void {
    if (!session.isReviewer) {
        result.provisionalTileIds.push(tileId);
    }
}

function toPushFailure(
    operation: PushOperation,
    loadedFeatures: Feature<Geometry | null>[],
    error: unknown,
): PushFailure {
    switch (operation.kind) {
        case "save-tile":
        case "delete-tile": {
            const { conflict } = loadedTileFeatures(
                loadedFeatures,
                operation.tileId,
            );
            return {
                resourceInstanceId: conflict.resourceInstanceId,
                resourceName: conflict.resourceName,
                isNewResource: false,
                error,
            };
        }
        case "add-tile": {
            const resourceProperties = loadedFeatures.find(
                (feature) =>
                    feature.properties?.resourceinstanceid ===
                    operation.resourceInstanceId,
            )?.properties;
            return {
                resourceInstanceId: operation.resourceInstanceId,
                resourceName:
                    typeof resourceProperties?.primary_name === "string"
                        ? resourceProperties.primary_name
                        : null,
                isNewResource: false,
                error,
            };
        }
        case "create-resource":
            return {
                resourceInstanceId: null,
                resourceName: null,
                isNewResource: true,
                error,
            };
    }
}

/**
 * Replaces a layer with a fresh load from Arches. Splits and copies leave the
 * layer holding duplicate feature keys, so after a push the layer is
 * reloaded rather than re-baselined in place.
 */
export async function reloadArchesLayer(
    geolibreApp: GeoLibreAppAPI,
    fetchImplementation: typeof fetch,
    session: ArchesSession,
    loadedLayer: Pick<LoadedArchesLayer, "layerId" | "node" | "source"> &
        Partial<Pick<LoadedArchesLayer, "isWritable" | "key">>,
    options: { afterPush?: boolean } = {},
): Promise<LoadedArchesLayer> {
    if (options.afterPush) {
        await waitForSearchIndex();
    }
    const isWritable = loadedLayer.isWritable ?? true;
    if (geolibreApp.updateGeoJsonLayer) {
        const features = tagArchesFeatures(
            await fetchSourceFeatures(
                fetchImplementation,
                session,
                loadedLayer.node,
                { source: loadedLayer.source, isWritable },
            ),
        ).features;
        if (
            geolibreApp.updateGeoJsonLayer(loadedLayer.layerId, {
                type: "FeatureCollection",
                features,
            } as FeatureCollection)
        ) {
            return {
                key: loadedLayer.key ?? crypto.randomUUID(),
                layerId: loadedLayer.layerId,
                node: loadedLayer.node,
                source: loadedLayer.source,
                isWritable,
                baselineFeatures: structuredClone(features),
                contentRevision: 0,
            };
        }
    }
    const reloadedLayer = await loadArchesLayer(
        geolibreApp,
        fetchImplementation,
        session,
        loadedLayer.node,
        {
            source: loadedLayer.source,
            isWritable,
            key: loadedLayer.key,
        },
    );
    removeLayer(geolibreApp, loadedLayer.layerId);
    return reloadedLayer;
}

/**
 * Puts features in a loaded layer's place: in the same GeoLibre layer where
 * the host can update one, otherwise in a new layer replacing it.
 */
function replaceLayerContent(
    geolibreApp: GeoLibreAppAPI,
    session: ArchesSession,
    loadedLayer: LoadedArchesLayer,
    source: ArchesLayerSource,
    features: Feature<Geometry | null>[],
): string {
    const featureCollection = {
        type: "FeatureCollection",
        features,
    } as FeatureCollection;
    if (
        geolibreApp.updateGeoJsonLayer?.(loadedLayer.layerId, featureCollection)
    ) {
        return loadedLayer.layerId;
    }
    const layerId = addStyledLayer(
        geolibreApp,
        session,
        loadedLayer.node,
        source,
        features,
    );
    removeLayer(geolibreApp, loadedLayer.layerId);
    return layerId;
}

/** Lets writes reach the search index before reading them back. */
export function waitForSearchIndex(): Promise<void> {
    return new Promise((resolve) =>
        setTimeout(resolve, SEARCH_INDEX_REFRESH_MILLISECONDS),
    );
}

/**
 * Removes a layer. Hosts without removeLayer (GeoLibre 3.4.0 and earlier;
 * added by opengeos/GeoLibre#3128, merged for the next release) fall back to
 * unregisterExternalNativeLayer, which in GeoLibre 3.4 removes
 * any layer by id; this is the only place the plugin relies on that.
 */
export function removeLayer(
    geolibreApp: GeoLibreAppAPI,
    layerId: string,
): void {
    if (geolibreApp.removeLayer) {
        geolibreApp.removeLayer(layerId);
    } else {
        geolibreApp.unregisterExternalNativeLayer?.(layerId);
    }
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
