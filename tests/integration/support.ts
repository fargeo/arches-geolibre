import {
    fetchNodeFeatures,
    signInWithPassword,
} from "@/arches_geolibre/utils/arches-client.ts";
import {
    pushLayerChanges,
    waitForSearchIndex,
} from "@/arches_geolibre/utils/arches-layers.ts";
import { detectFeatureChanges } from "@/arches_geolibre/utils/change-detection.ts";
import { tagArchesFeatures } from "@/arches_geolibre/utils/feature-keys.ts";
import { reconcilePendingChanges } from "@/arches_geolibre/utils/push-plan.ts";

import type { Feature, Geometry } from "geojson";
import type { GeoLibreAppAPI } from "@/arches_geolibre/geolibre/host-api.ts";
import type { PushResult } from "@/arches_geolibre/utils/arches-layers.ts";
import type { ChangeTarget } from "@/arches_geolibre/utils/push-plan.ts";
import type {
    ArchesGeometryNode,
    ArchesSession,
    LoadedArchesLayer,
} from "@/arches_geolibre/types.ts";

// Matches test-instance/geolibre_test_support/constants.py.
export const ARCHES_TEST_URL =
    process.env.ARCHES_TEST_URL ?? "http://localhost:8002";
export const EDITOR_USERNAME = "geolibre_editor";
export const CONTRIBUTOR_USERNAME = "geolibre_contributor";
export const VIEWER_USERNAME = "geolibre_viewer";
export const LOCATION_NODE: ArchesGeometryNode = {
    nodeid: "c776e991-01ed-5781-b01e-5ee7950c23ff",
    name: "Location",
    graph_id: "45f4ab91-54cf-5e17-ba25-c12873c73385",
    nodegroup_id: "c776e991-01ed-5781-b01e-5ee7950c23ff",
    resourcemodelname: "GeoLibre Test Asset",
};
export const EXTENT_NODE: ArchesGeometryNode = {
    nodeid: "893fe3f2-56ef-5dc6-90ec-5487aa9423c8",
    name: "Extent",
    graph_id: "45f4ab91-54cf-5e17-ba25-c12873c73385",
    nodegroup_id: "893fe3f2-56ef-5dc6-90ec-5487aa9423c8",
    resourcemodelname: "GeoLibre Test Asset",
};

export const TEST_PASSWORD = "geolibre-test-password";

export function signIn(username: string): Promise<ArchesSession> {
    return signInWithPassword(fetch, ARCHES_TEST_URL, username, TEST_PASSWORD);
}

/**
 * Stands in for GeoLibre: the layer holds whatever features a test says the
 * user left it with after a GeoEditor session.
 */
export class FakeGeoLibreApp {
    private readonly featuresByLayerId = new Map<
        string,
        Feature<Geometry | null>[]
    >();

    setLayerFeatures(
        layerId: string,
        features: Feature<Geometry | null>[],
    ): void {
        this.featuresByLayerId.set(layerId, structuredClone(features));
    }

    asHostApi(): GeoLibreAppAPI {
        return {
            addGeoJsonLayer: (_name, featureCollection) => {
                const layerId = crypto.randomUUID();
                this.setLayerFeatures(layerId, featureCollection.features);
                return layerId;
            },
            getLayerFeatures: (layerId) =>
                structuredClone(this.featuresByLayerId.get(layerId) ?? []),
            unregisterExternalNativeLayer: (layerId) => {
                this.featuresByLayerId.delete(layerId);
            },
        };
    }
}

/** Loads one resource's features in a node as a plugin layer would. */
export async function loadResourceLayer(
    fakeApp: FakeGeoLibreApp,
    session: ArchesSession,
    resourceInstanceId: string,
    node: ArchesGeometryNode = LOCATION_NODE,
): Promise<LoadedArchesLayer> {
    const taggedCollection = tagArchesFeatures(
        await fetchNodeFeatures(fetch, session, node.nodeid, {
            resourceInstanceIds: [resourceInstanceId],
        }),
    );
    const layerId = crypto.randomUUID();
    fakeApp.setLayerFeatures(layerId, taggedCollection.features);
    return {
        key: layerId,
        layerId,
        node,
        source: { kind: "node" },
        isWritable: true,
        baselineFeatures: structuredClone(taggedCollection.features),
        contentRevision: 0,
    };
}

let generatedResourceId: Promise<string> | undefined;

/**
 * A generated resource the test groups have object permissions on, rather
 * than one the plugin creates: without archesproject/arches#13012,
 * /api/node_value/ leaves new resources without an owner, so under the
 * default-deny framework no one but a superuser can see them.
 */
export function findGeneratedResourceId(
    session: ArchesSession,
): Promise<string> {
    generatedResourceId ??= fetchFirstResourceIds(session, 1).then(
        ([resourceInstanceId]) => resourceInstanceId,
    );
    return generatedResourceId;
}

/** The first `count` resources with a Location, in /geojson's order. */
async function fetchFirstResourceIds(
    session: ArchesSession,
    count: number,
): Promise<string[]> {
    const query = new URLSearchParams({
        nodeid: LOCATION_NODE.nodeid,
        limit: String(count),
    });
    const response = await fetch(`${session.instanceUrl}/geojson?${query}`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    const featureCollection = (await response.json()) as {
        features: Feature<Geometry>[];
    };
    return [
        ...new Set(
            featureCollection.features.map(
                (feature) => feature.properties?.resourceinstanceid as string,
            ),
        ),
    ];
}

/**
 * Pushes every change in a layer, as a user who leaves all changes ticked.
 * Freshly drawn features go to `target`, or to new resources.
 */
export async function pushEverything(
    fakeApp: FakeGeoLibreApp,
    session: ArchesSession,
    loadedLayer: LoadedArchesLayer,
    target: ChangeTarget = { kind: "new-resource" },
): Promise<PushResult> {
    const geolibreApp = fakeApp.asHostApi();
    const changes = detectFeatureChanges(
        loadedLayer.baselineFeatures,
        geolibreApp.getLayerFeatures?.(loadedLayer.layerId) ?? [],
    );
    const pendingChanges = reconcilePendingChanges([], changes).map(
        (pendingChange) => ({ ...pendingChange, target }),
    );
    const pushResult = await pushLayerChanges(
        geolibreApp,
        fetch,
        session,
        loadedLayer,
        pendingChanges,
    );
    await waitForSearchIndex();
    return pushResult;
}

/** A generated resource with no Extent geometry, from the first few. */
export async function findResourceWithoutExtent(
    session: ArchesSession,
): Promise<string> {
    const candidateIds = await fetchFirstResourceIds(session, 20);
    const extents = await fetchNodeFeatures(
        fetch,
        session,
        EXTENT_NODE.nodeid,
        {
            resourceInstanceIds: candidateIds,
        },
    );
    const idsWithExtent = new Set(
        extents.features.map(
            (feature) => feature.properties?.resourceinstanceid,
        ),
    );
    const resourceInstanceId = candidateIds.find(
        (candidateId) => !idsWithExtent.has(candidateId),
    );
    if (!resourceInstanceId) {
        throw new Error("No test resource without an Extent was found.");
    }
    return resourceInstanceId;
}
