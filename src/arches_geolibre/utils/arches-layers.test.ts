import {
    featureBounds,
    reloadArchesLayer,
    removeLayer,
    replaceArchesLayerFeatures,
} from "@/arches_geolibre/utils/arches-layers.ts";

import type { Feature, Geometry } from "geojson";
import type { GeoLibreAppAPI } from "@/arches_geolibre/geolibre/host-api.ts";
import type {
    ArchesSession,
    LoadedArchesLayer,
} from "@/arches_geolibre/types.ts";

const SESSION: ArchesSession = {
    instanceUrl: "https://arches.example.org",
    clientId: "client",
    accessToken: "token",
    refreshToken: "refresh",
    expiresAt: Date.now() + 3_600_000,
    userId: 1,
    username: "editor",
    isReviewer: true,
};

const STORED_FEATURE: Feature<Geometry> = {
    type: "Feature",
    id: 1,
    geometry: { type: "Point", coordinates: [-0.1, 51.5] },
    properties: { tileid: "tile-1", featureid: "feature-1" },
};

function loadedLayer(): LoadedArchesLayer {
    return {
        key: "layer-key",
        layerId: "geolibre-layer",
        node: {
            nodeid: "location",
            name: "Location",
            graph_id: "graph",
            nodegroup_id: "location",
            resourcemodelname: "Heritage Asset",
        },
        source: { kind: "node" },
        isWritable: true,
        baselineFeatures: [],
        contentRevision: 2,
    };
}

/** A GeoLibre host, with or without opengeos/GeoLibre#3128's layer updates. */
function fakeHost({ canUpdateLayers }: { canUpdateLayers: boolean }) {
    const host = {
        addGeoJsonLayer: vi.fn(() => "new-geolibre-layer"),
        unregisterExternalNativeLayer: vi.fn(),
        ...(canUpdateLayers && {
            updateGeoJsonLayer: vi.fn(() => true),
            removeLayer: vi.fn(),
        }),
    };
    return host as typeof host & Partial<GeoLibreAppAPI>;
}

const archesWithOneFeature = vi.fn(
    async () =>
        new Response(
            JSON.stringify({
                type: "FeatureCollection",
                features: [STORED_FEATURE],
            }),
        ),
);

describe("layer updates", () => {
    it("removes a layer through removeLayer, or the older workaround", () => {
        const updatingHost = fakeHost({ canUpdateLayers: true });
        removeLayer(updatingHost as GeoLibreAppAPI, "layer");
        expect(updatingHost.removeLayer).toHaveBeenCalledWith("layer");
        expect(
            updatingHost.unregisterExternalNativeLayer,
        ).not.toHaveBeenCalled();

        const olderHost = fakeHost({ canUpdateLayers: false });
        removeLayer(olderHost as GeoLibreAppAPI, "layer");
        expect(olderHost.unregisterExternalNativeLayer).toHaveBeenCalledWith(
            "layer",
        );
    });

    it("replaces features in the same GeoLibre layer where the host can", () => {
        const host = fakeHost({ canUpdateLayers: true });

        const updatedLayer = replaceArchesLayerFeatures(
            host as GeoLibreAppAPI,
            SESSION,
            loadedLayer(),
            { features: [STORED_FEATURE] },
        );

        expect(updatedLayer.layerId).toBe("geolibre-layer");
        expect(updatedLayer.contentRevision).toBe(3);
        expect(host.addGeoJsonLayer).not.toHaveBeenCalled();
        expect(host.removeLayer).not.toHaveBeenCalled();
    });

    it("replaces the GeoLibre layer on hosts without layer updates", () => {
        const host = fakeHost({ canUpdateLayers: false });

        const updatedLayer = replaceArchesLayerFeatures(
            host as GeoLibreAppAPI,
            SESSION,
            loadedLayer(),
            { features: [STORED_FEATURE] },
        );

        expect(updatedLayer.layerId).toBe("new-geolibre-layer");
        expect(updatedLayer.key).toBe("layer-key");
        expect(host.unregisterExternalNativeLayer).toHaveBeenCalledWith(
            "geolibre-layer",
        );
    });

    it("reloads from Arches into the same GeoLibre layer where the host can", async () => {
        const host = fakeHost({ canUpdateLayers: true });

        const reloadedLayer = await reloadArchesLayer(
            host as GeoLibreAppAPI,
            archesWithOneFeature,
            SESSION,
            loadedLayer(),
        );

        expect(reloadedLayer.layerId).toBe("geolibre-layer");
        expect(reloadedLayer.key).toBe("layer-key");
        expect(reloadedLayer.baselineFeatures).toHaveLength(1);
        expect(host.addGeoJsonLayer).not.toHaveBeenCalled();
    });

    it("reloads into a new GeoLibre layer when the host refuses the update", async () => {
        const host = fakeHost({ canUpdateLayers: true });
        host.updateGeoJsonLayer?.mockReturnValue(false);

        const reloadedLayer = await reloadArchesLayer(
            host as GeoLibreAppAPI,
            archesWithOneFeature,
            SESSION,
            loadedLayer(),
        );

        expect(reloadedLayer.layerId).toBe("new-geolibre-layer");
        expect(host.removeLayer).toHaveBeenCalledWith("geolibre-layer");
    });
});

describe("featureBounds", () => {
    it("spans points, polygons and multi-part geometries", () => {
        expect(
            featureBounds([
                {
                    type: "Feature",
                    geometry: { type: "Point", coordinates: [1, 2] },
                    properties: {},
                },
                {
                    type: "Feature",
                    geometry: {
                        type: "MultiPolygon",
                        coordinates: [
                            [
                                [
                                    [-3, -4],
                                    [5, -4],
                                    [5, 6],
                                    [-3, -4],
                                ],
                            ],
                        ],
                    },
                    properties: {},
                },
                { type: "Feature", geometry: null, properties: {} },
            ]),
        ).toEqual([-3, -4, 5, 6]);
    });

    it("has no bounds without geometry", () => {
        expect(featureBounds([])).toBeNull();
    });
});
