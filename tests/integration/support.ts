import { signInWithPassword } from "@/arches_geolibre/utils/arches-client.ts";
import { fetchNodeFeatures } from "@/arches_geolibre/utils/arches-client.ts";
import { tagArchesFeatures } from "@/arches_geolibre/utils/feature-keys.ts";

import type { Feature, Geometry } from "geojson";
import type { GeoLibreAppAPI } from "@/arches_geolibre/geolibre/host-api.ts";
import type {
    ArchesGeometryNode,
    ArchesSession,
    LoadedArchesLayer,
} from "@/arches_geolibre/types.ts";

// Matches test-instance/geolibre_test_support/constants.py.
export const ARCHES_TEST_URL =
    process.env.ARCHES_TEST_URL ?? "http://localhost:8001";
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

const TEST_PASSWORD = "geolibre-test-password";

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

/** Loads one resource's Location features as a plugin layer would. */
export async function loadResourceLayer(
    fakeApp: FakeGeoLibreApp,
    session: ArchesSession,
    resourceInstanceId: string,
): Promise<LoadedArchesLayer> {
    const taggedCollection = tagArchesFeatures(
        await fetchNodeFeatures(fetch, session, LOCATION_NODE.nodeid, [
            resourceInstanceId,
        ]),
    );
    const layerId = crypto.randomUUID();
    fakeApp.setLayerFeatures(layerId, taggedCollection.features);
    return {
        layerId,
        node: LOCATION_NODE,
        isWritable: true,
        baselineFeatures: structuredClone(taggedCollection.features),
    };
}

/**
 * A generated resource the test groups have object permissions on. Resources
 * the plugin creates can't be used: on 8.1 /api/node_value/ leaves them
 * without an owner or permissions, so under the default-deny framework no
 * one but a superuser can see them.
 */
export async function findGeneratedResourceId(
    session: ArchesSession,
): Promise<string> {
    const query = new URLSearchParams({
        nodeid: LOCATION_NODE.nodeid,
        limit: "1",
    });
    const response = await fetch(`${session.instanceUrl}/geojson?${query}`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    const featureCollection = (await response.json()) as {
        features: Feature<Geometry>[];
    };
    return featureCollection.features[0].properties?.resourceinstanceid;
}
