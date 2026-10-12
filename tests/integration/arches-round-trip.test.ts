import {
    fetchGeometryNodes,
    fetchNodeFeatures,
    refreshSession,
} from "@/arches_geolibre/utils/arches-client.ts";
import { pushLayerChanges } from "@/arches_geolibre/utils/arches-layers.ts";

import {
    CONTRIBUTOR_USERNAME,
    EDITOR_USERNAME,
    FakeGeoLibreApp,
    LOCATION_NODE,
    VIEWER_USERNAME,
    findGeneratedResourceId,
    loadResourceLayer,
    signIn,
} from "./support.ts";

import type { Feature, Geometry, Polygon } from "geojson";
import type { ArchesSession } from "@/arches_geolibre/types.ts";

function square(west: number, south: number, size = 0.001): Polygon {
    return {
        type: "Polygon",
        coordinates: [
            [
                [west, south],
                [west + size, south],
                [west + size, south + size],
                [west, south + size],
                [west, south],
            ],
        ],
    };
}

function drawnFeature(geometry: Geometry): Feature<Geometry | null> {
    return { type: "Feature", id: "0", geometry, properties: {} };
}

let editorSession: ArchesSession;
let contributorSession: ArchesSession;
let viewerSession: ArchesSession;

beforeAll(async () => {
    editorSession = await signIn(EDITOR_USERNAME);
    contributorSession = await signIn(CONTRIBUTOR_USERNAME);
    viewerSession = await signIn(VIEWER_USERNAME);
});

describe("signing in", () => {
    it("reads whose edits need review", () => {
        expect(editorSession.username).toBe(EDITOR_USERNAME);
        expect(editorSession.isReviewer).toBe(true);
        expect(contributorSession.isReviewer).toBe(false);
    });

    it("refreshes a session with its refresh token", async () => {
        const refreshedSession = await refreshSession(fetch, editorSession);
        expect(refreshedSession.accessToken).not.toBe(
            editorSession.accessToken,
        );
        editorSession = refreshedSession;
    });
});

describe("catalog and loading", () => {
    it("lists the test model's geometry nodes", async () => {
        const nodes = await fetchGeometryNodes(
            fetch,
            editorSession,
            "read_nodegroup",
        );
        expect(nodes.map((node) => node.name)).toEqual(
            expect.arrayContaining(["Location", "Extent"]),
        );
    });

    it("loads a whole geometry node, reporting featureid", async () => {
        const startedAt = performance.now();
        const featureCollection = await fetchNodeFeatures(
            fetch,
            editorSession,
            LOCATION_NODE.nodeid,
        );
        const elapsedSeconds = (performance.now() - startedAt) / 1000;
        console.info(
            `Loaded ${featureCollection.features.length} Location features in ${elapsedSeconds.toFixed(1)} s`,
        );

        expect(featureCollection.features.length).toBeGreaterThan(0);
        expect(featureCollection.features[0].properties).toMatchObject({
            tileid: expect.any(String),
            featureid: expect.any(String),
            resourceinstanceid: expect.any(String),
        });
    });
});

describe("creating a resource", () => {
    const fakeApp = new FakeGeoLibreApp();
    let createdResourceId: string;

    it("creates a resource from a freshly drawn feature", async () => {
        const layerId = crypto.randomUUID();
        fakeApp.setLayerFeatures(layerId, [drawnFeature(square(-0.1, 51.5))]);

        const pushResult = await pushLayerChanges(
            fakeApp.asHostApi(),
            fetch,
            editorSession,
            {
                layerId,
                node: LOCATION_NODE,
                isWritable: true,
                baselineFeatures: [],
            },
        );

        expect(pushResult.failures).toEqual([]);
        expect(pushResult.createdResourceIds).toHaveLength(1);
        createdResourceId = pushResult.createdResourceIds[0];
    });

    // Arches 8.1 bug: /api/node_value/ saves new resources without a principal
    // user or permissions, so under default-deny their creator can't see them.
    // This starts passing (and so fails as `it.fails`) once core is fixed.
    it.fails(
        "lets the creator read back the resource they created",
        async () => {
            const featureCollection = await fetchNodeFeatures(
                fetch,
                editorSession,
                LOCATION_NODE.nodeid,
                [createdResourceId],
            );
            expect(featureCollection.features).toHaveLength(1);
        },
    );
});

describe("editing an existing resource", () => {
    const fakeApp = new FakeGeoLibreApp();
    const geolibreApp = fakeApp.asHostApi();
    let resourceInstanceId: string;
    let originalFeatureCount: number;

    beforeAll(async () => {
        resourceInstanceId = await findGeneratedResourceId(editorSession);
        const loadedLayer = await loadResourceLayer(
            fakeApp,
            editorSession,
            resourceInstanceId,
        );
        originalFeatureCount = loadedLayer.baselineFeatures.length;
    });

    it("saves an edited geometry and keeps the feature's id", async () => {
        const loadedLayer = await loadResourceLayer(
            fakeApp,
            editorSession,
            resourceInstanceId,
        );
        const [firstFeature, ...otherFeatures] = loadedLayer.baselineFeatures;
        const movedGeometry = square(-0.2, 51.6 + Math.random() / 100);
        fakeApp.setLayerFeatures(loadedLayer.layerId, [
            { ...firstFeature, geometry: movedGeometry },
            ...otherFeatures,
        ]);

        const pushResult = await pushLayerChanges(
            geolibreApp,
            fetch,
            editorSession,
            loadedLayer,
        );
        expect(pushResult.failures).toEqual([]);
        expect(pushResult.savedTileCount).toBe(1);
        expect(pushResult.provisionalTileCount).toBe(0);

        const reloadedLayer = await loadResourceLayer(
            fakeApp,
            editorSession,
            resourceInstanceId,
        );
        const reloadedFirstFeature = reloadedLayer.baselineFeatures.find(
            (feature) =>
                feature.properties?.featureid ===
                firstFeature.properties?.featureid,
        );
        expect(reloadedFirstFeature?.geometry).toEqual(movedGeometry);
    });

    it("keeps a split-off part on the same tile", async () => {
        const loadedLayer = await loadResourceLayer(
            fakeApp,
            editorSession,
            resourceInstanceId,
        );
        const [firstFeature] = loadedLayer.baselineFeatures;
        fakeApp.setLayerFeatures(loadedLayer.layerId, [
            ...loadedLayer.baselineFeatures,
            { ...firstFeature, id: "17", geometry: square(-0.3, 51.6) },
        ]);

        const pushResult = await pushLayerChanges(
            geolibreApp,
            fetch,
            editorSession,
            loadedLayer,
        );
        expect(pushResult.failures).toEqual([]);
        expect(pushResult.createdResourceIds).toEqual([]);

        const reloadedLayer = await loadResourceLayer(
            fakeApp,
            editorSession,
            resourceInstanceId,
        );
        const tileIds = new Set(
            reloadedLayer.baselineFeatures.map(
                (feature) => feature.properties?.tileid,
            ),
        );
        expect(reloadedLayer.baselineFeatures).toHaveLength(
            originalFeatureCount + 1,
        );
        expect(tileIds.size).toBe(1);
    });

    it("deletes a feature", async () => {
        const loadedLayer = await loadResourceLayer(
            fakeApp,
            editorSession,
            resourceInstanceId,
        );
        fakeApp.setLayerFeatures(
            loadedLayer.layerId,
            loadedLayer.baselineFeatures.slice(0, -1),
        );

        const pushResult = await pushLayerChanges(
            geolibreApp,
            fetch,
            editorSession,
            loadedLayer,
        );
        expect(pushResult.failures).toEqual([]);

        const reloadedLayer = await loadResourceLayer(
            fakeApp,
            editorSession,
            resourceInstanceId,
        );
        expect(reloadedLayer.baselineFeatures).toHaveLength(
            originalFeatureCount,
        );
    });

    it("saves a non-reviewer's edit as provisional, leaving the map unchanged", async () => {
        const loadedLayer = await loadResourceLayer(
            fakeApp,
            editorSession,
            resourceInstanceId,
        );
        const [firstFeature, ...otherFeatures] = loadedLayer.baselineFeatures;
        fakeApp.setLayerFeatures(loadedLayer.layerId, [
            { ...firstFeature, geometry: square(-0.5, 51.3) },
            ...otherFeatures,
        ]);

        const pushResult = await pushLayerChanges(
            geolibreApp,
            fetch,
            contributorSession,
            loadedLayer,
        );
        expect(pushResult.failures).toEqual([]);
        expect(pushResult.provisionalTileCount).toBe(1);

        const reloadedLayer = await loadResourceLayer(
            fakeApp,
            editorSession,
            resourceInstanceId,
        );
        expect(reloadedLayer.baselineFeatures[0].geometry).toEqual(
            firstFeature.geometry,
        );
    });

    it("refuses an edit from a user without edit rights", async () => {
        const loadedLayer = await loadResourceLayer(
            fakeApp,
            editorSession,
            resourceInstanceId,
        );
        const [firstFeature, ...otherFeatures] = loadedLayer.baselineFeatures;
        fakeApp.setLayerFeatures(loadedLayer.layerId, [
            { ...firstFeature, geometry: square(-0.4, 51.4) },
            ...otherFeatures,
        ]);

        const pushResult = await pushLayerChanges(
            geolibreApp,
            fetch,
            viewerSession,
            loadedLayer,
        );

        expect(pushResult.savedTileCount).toBe(0);
        expect(pushResult.failures).toEqual([
            expect.stringContaining("HTTP 403"),
        ]);
    });
});
