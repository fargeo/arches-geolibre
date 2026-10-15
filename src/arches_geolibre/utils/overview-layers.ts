import { applyArchesStyle } from "@/arches_geolibre/utils/arches-layers.ts";

import type { GeoLibreAppAPI } from "@/arches_geolibre/geolibre/host-api.ts";
import type {
    ArchesGeometryNode,
    ArchesSession,
} from "@/arches_geolibre/types.ts";

/**
 * A read-only layer drawing a node from Arches' vector tiles. It shows a large
 * node at once without downloading its GeoJSON, but can't be edited.
 */
export interface OverviewLayer {
    layerId: string;
    instanceUrl: string;
    node: ArchesGeometryNode;
}

/**
 * Whether GeoLibre can show an overview: it needs vector tile layers with
 * request headers (opengeos/GeoLibre#3140 and #3142), since Arches' tiles
 * only show what the signed-in user may read.
 */
export function canAddOverviewLayers(geolibreApp: GeoLibreAppAPI): boolean {
    return (
        geolibreApp.addVectorTileLayer !== undefined &&
        geolibreApp.setLayerRequestHeaders !== undefined
    );
}

export function overviewTileUrl(instanceUrl: string, nodeId: string): string {
    return `${instanceUrl}/mvt/${nodeId}/{z}/{x}/{y}.pbf`;
}

export function overviewLayerName(node: ArchesGeometryNode): string {
    return `${node.resourcemodelname}: ${node.name} (overview)`;
}

function authorizationHeaders(session: ArchesSession): Record<string, string> {
    return { Authorization: `Bearer ${session.accessToken}` };
}

/**
 * Adds a node's overview layer, styled as Arches styles the node. Each Arches
 * tile holds one source layer, named after the node.
 */
export function addOverviewLayer(
    geolibreApp: GeoLibreAppAPI,
    session: ArchesSession,
    node: ArchesGeometryNode,
): OverviewLayer {
    if (!geolibreApp.addVectorTileLayer) {
        throw new Error("This GeoLibre can't show vector tile layers.");
    }
    const layerId = geolibreApp.addVectorTileLayer(
        overviewLayerName(node),
        overviewTileUrl(session.instanceUrl, node.nodeid),
        {
            sourceLayers: [node.nodeid],
            headers: authorizationHeaders(session),
        },
    );
    applyArchesStyle(geolibreApp, layerId, node);
    return { layerId, instanceUrl: session.instanceUrl, node };
}

/**
 * Brings the overview layers' tile headers in line with the session: the
 * current token for layers from the signed-in instance, none otherwise (signed
 * out, or a project's layers from another instance). GeoLibre keeps headers in
 * memory only, so this also restores them after a project is reopened.
 *
 * @returns The overview layers still in GeoLibre; removed ones are dropped.
 */
export function syncOverviewHeaders(
    geolibreApp: GeoLibreAppAPI,
    overviewLayers: OverviewLayer[],
    session: ArchesSession | null,
): OverviewLayer[] {
    const presentLayerIds = geolibreApp.getLayers
        ? new Set(geolibreApp.getLayers())
        : null;
    const remaining = presentLayerIds
        ? overviewLayers.filter((overviewLayer) =>
              presentLayerIds.has(overviewLayer.layerId),
          )
        : overviewLayers;
    for (const overviewLayer of remaining) {
        const headers =
            session && session.instanceUrl === overviewLayer.instanceUrl
                ? authorizationHeaders(session)
                : null;
        try {
            geolibreApp.setLayerRequestHeaders?.(
                overviewLayer.layerId,
                headers,
            );
        } catch (error) {
            console.warn(
                `[arches-geolibre] Could not set the overview's sign-in for ${overviewLayer.node.name}.`,
                error,
            );
        }
    }
    return remaining;
}
