import {
    deleteTile,
    searchNodeFeatures,
    saveTileGeometry,
} from "@/arches_geolibre/utils/arches-client.ts";
import { tagArchesFeatures } from "@/arches_geolibre/utils/feature-keys.ts";
import { buildArchesLayerStyle } from "@/arches_geolibre/utils/layer-style.ts";
import {
    affectedResourceId,
    buildPushOperations,
    isFreshlyDrawn,
} from "@/arches_geolibre/utils/push-plan.ts";

import type { Feature, Geometry } from "geojson";
import type { GeoLibreAppAPI } from "@/arches_geolibre/geolibre/host-api.ts";
import type { MapBounds } from "@/arches_geolibre/utils/arches-client.ts";
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
    failures: string[];
}

export interface LoadArchesLayerOptions {
    source: ArchesLayerSource;
    isWritable: boolean;
    /** The area to load; null loads every resource (up to the limit). */
    bounds: MapBounds | null;
    signal?: AbortSignal;
    onProgress?: (loadedResources: number, totalResources: number) => void;
}

/** Elasticsearch makes writes searchable within about a second. */
const SEARCH_INDEX_REFRESH_MILLISECONDS = 1500;

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
 * Loads a geometry node's features within an area into a new GeoLibre layer,
 * styled as Arches styles it. A spatial view loads its geometry node: on 8.1
 * there is no endpoint that reads a view's attribute columns.
 */
export async function loadArchesLayer(
    geolibreApp: GeoLibreAppAPI,
    fetchImplementation: typeof fetch,
    session: ArchesSession,
    node: ArchesGeometryNode,
    options: LoadArchesLayerOptions,
): Promise<LoadedArchesLayer> {
    const taggedCollection = tagArchesFeatures(
        await searchNodeFeatures(fetchImplementation, session, node, {
            bounds: options.bounds,
            signal: options.signal,
            onProgress: options.onProgress,
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
    return {
        layerId,
        node,
        source: options.source,
        bounds: options.bounds,
        isWritable: options.isWritable,
        baselineFeatures: structuredClone(taggedCollection.features),
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
        failures: [],
    };
    const nodeId = loadedLayer.node.nodeid;

    for (const operation of operations) {
        try {
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
                    ...(operation.kind === "add-tile" && {
                        resourceInstanceId: operation.resourceInstanceId,
                    }),
                },
            );
            if (operation.kind === "create-resource") {
                result.createdResourceIds.push(savedTile.resourceinstance_id);
            } else {
                result.savedTileCount += 1;
            }
            recordProvisional(result, session, savedTile.tileid);
        } catch (error) {
            result.failures.push(describeFailure(operation, error));
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
    const featureCollection = await searchNodeFeatures(
        fetchImplementation,
        session,
        node,
        { resourceInstanceIds: resourceIdsToFetch },
    );
    return tagArchesFeatures(featureCollection).features;
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

function describeFailure(operation: PushOperation, error: unknown): string {
    switch (operation.kind) {
        case "save-tile":
        case "delete-tile":
            return `Tile ${operation.tileId}: ${String(error)}`;
        case "add-tile":
            return `Resource ${operation.resourceInstanceId}: ${String(error)}`;
        case "create-resource":
            return `New resource: ${String(error)}`;
    }
}

/**
 * Replaces a layer with a fresh load from Arches, of its own area or of
 * `bounds`. Splits and copies leave the layer holding duplicate feature keys,
 * so after a push the layer is reloaded rather than re-baselined in place.
 */
export async function reloadArchesLayer(
    geolibreApp: GeoLibreAppAPI,
    fetchImplementation: typeof fetch,
    session: ArchesSession,
    loadedLayer: Pick<LoadedArchesLayer, "layerId" | "node" | "source"> &
        Partial<Pick<LoadedArchesLayer, "isWritable" | "bounds">>,
    options: {
        bounds?: MapBounds | null;
        afterPush?: boolean;
        onProgress?: LoadArchesLayerOptions["onProgress"];
    } = {},
): Promise<LoadedArchesLayer> {
    if (options.afterPush) {
        await waitForSearchIndex();
    }
    const reloadedLayer = await loadArchesLayer(
        geolibreApp,
        fetchImplementation,
        session,
        loadedLayer.node,
        {
            source: loadedLayer.source,
            isWritable: loadedLayer.isWritable ?? true,
            bounds:
                options.bounds !== undefined
                    ? options.bounds
                    : (loadedLayer.bounds ?? null),
            onProgress: options.onProgress,
        },
    );
    removeLayer(geolibreApp, loadedLayer.layerId);
    return reloadedLayer;
}

/** Lets writes reach Arches search before reading them back through it. */
export function waitForSearchIndex(): Promise<void> {
    return new Promise((resolve) =>
        setTimeout(resolve, SEARCH_INDEX_REFRESH_MILLISECONDS),
    );
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
