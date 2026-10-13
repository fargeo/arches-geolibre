import {
    fetchCanEditResource,
    fetchGeometryNodes,
    fetchSpatialViews,
    refreshSession,
    fetchNodeFeatures,
    searchResources,
} from "@/arches_geolibre/utils/arches-client.ts";
import { waitForSearchIndex } from "@/arches_geolibre/utils/arches-layers.ts";
import { fetchOwnPendingFeatures } from "@/arches_geolibre/utils/pending-review.ts";

import {
    CONTRIBUTOR_USERNAME,
    EDITOR_USERNAME,
    EXTENT_NODE,
    FakeGeoLibreApp,
    LOCATION_NODE,
    VIEWER_USERNAME,
    findGeneratedResourceId,
    findResourceWithoutExtent,
    loadResourceLayer,
    pushEverything,
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
    it("lists the test spatial view", async () => {
        const spatialViews = await fetchSpatialViews(fetch, editorSession);
        expect(spatialViews.map((spatialView) => spatialView.slug)).toContain(
            "geolibre_test_locations",
        );
    });

    it("tells editors and viewers apart for a resource", async () => {
        const resourceInstanceId = await findGeneratedResourceId(editorSession);
        expect(
            await fetchCanEditResource(
                fetch,
                editorSession,
                resourceInstanceId,
            ),
        ).toBe(true);
        expect(
            await fetchCanEditResource(
                fetch,
                viewerSession,
                resourceInstanceId,
            ),
        ).toBe(false);
    });

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

    it("loads a whole geometry node, reporting featureid and names", async () => {
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
            primary_name: expect.any(String),
        });
    });
});

describe("creating a resource", () => {
    const fakeApp = new FakeGeoLibreApp();
    let createdResourceId: string;

    it("creates a resource from a freshly drawn feature", async () => {
        const layerId = crypto.randomUUID();
        fakeApp.setLayerFeatures(layerId, [drawnFeature(square(-0.1, 51.5))]);

        const pushResult = await pushEverything(fakeApp, editorSession, {
            layerId,
            node: LOCATION_NODE,
            source: { kind: "node" },
            isWritable: true,
            baselineFeatures: [],
        });

        expect(pushResult.failures).toEqual([]);
        expect(pushResult.createdResourceIds).toHaveLength(1);
        createdResourceId = pushResult.createdResourceIds[0];
    });

    // Requires archesproject/arches#13012: before it, new resources had no
    // owner, so under default-deny not even their creator could see them.
    it("lets the creator read back the resource they created", async () => {
        await waitForSearchIndex();
        const featureCollection = await fetchNodeFeatures(
            fetch,
            editorSession,
            LOCATION_NODE.nodeid,
            { resourceInstanceIds: [createdResourceId] },
        );
        expect(featureCollection.features).toHaveLength(1);
    });
});

describe("editing an existing resource", () => {
    const fakeApp = new FakeGeoLibreApp();
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

        const pushResult = await pushEverything(
            fakeApp,
            editorSession,
            loadedLayer,
        );
        expect(pushResult.failures).toEqual([]);
        expect(pushResult.savedTileCount).toBe(1);
        expect(pushResult.provisionalTileIds).toEqual([]);

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

        const pushResult = await pushEverything(
            fakeApp,
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

        const pushResult = await pushEverything(
            fakeApp,
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

    it("attaches a drawn feature to a resource already on the map", async () => {
        const loadedLayer = await loadResourceLayer(
            fakeApp,
            editorSession,
            resourceInstanceId,
        );
        fakeApp.setLayerFeatures(loadedLayer.layerId, [
            ...loadedLayer.baselineFeatures,
            drawnFeature(square(-0.25, 51.55)),
        ]);

        const pushResult = await pushEverything(
            fakeApp,
            editorSession,
            loadedLayer,
            {
                kind: "existing-resource",
                resourceInstanceId,
                name: "Attach target",
            },
        );
        expect(pushResult.failures).toEqual([]);
        expect(pushResult.createdResourceIds).toEqual([]);

        const reloadedLayer = await loadResourceLayer(
            fakeApp,
            editorSession,
            resourceInstanceId,
        );
        expect(reloadedLayer.baselineFeatures).toHaveLength(
            originalFeatureCount + 1,
        );

        fakeApp.setLayerFeatures(
            reloadedLayer.layerId,
            reloadedLayer.baselineFeatures.slice(0, -1),
        );
        await pushEverything(fakeApp, editorSession, reloadedLayer);
    });

    it("saves a non-reviewer's edit as provisional and shows it awaiting review", async () => {
        const loadedLayer = await loadResourceLayer(
            fakeApp,
            editorSession,
            resourceInstanceId,
        );
        const [firstFeature, ...otherFeatures] = loadedLayer.baselineFeatures;
        const proposedGeometry = square(-0.5, 51.3);
        fakeApp.setLayerFeatures(loadedLayer.layerId, [
            { ...firstFeature, geometry: proposedGeometry },
            ...otherFeatures,
        ]);

        const pushResult = await pushEverything(
            fakeApp,
            contributorSession,
            loadedLayer,
        );
        expect(pushResult.failures).toEqual([]);
        expect(pushResult.provisionalTileIds).toHaveLength(1);

        const reloadedLayer = await loadResourceLayer(
            fakeApp,
            editorSession,
            resourceInstanceId,
        );
        expect(reloadedLayer.baselineFeatures[0].geometry).toEqual(
            firstFeature.geometry,
        );

        const tileId = pushResult.provisionalTileIds[0];
        const awaitingReview = await fetchOwnPendingFeatures(
            fetch,
            contributorSession,
            [{ tileId, nodeId: LOCATION_NODE.nodeid }],
        );
        expect(awaitingReview.stillPending).toEqual([
            { tileId, nodeId: LOCATION_NODE.nodeid },
        ]);
        expect(
            awaitingReview.features.map((feature) => feature.geometry),
        ).toContainEqual(proposedGeometry);
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

        const pushResult = await pushEverything(
            fakeApp,
            viewerSession,
            loadedLayer,
        );

        expect(pushResult.savedTileCount).toBe(0);
        expect(pushResult.failures).toEqual([
            expect.stringContaining("HTTP 403"),
        ]);
    });
});

describe("tiles that gain or lose all their geometry", () => {
    const fakeApp = new FakeGeoLibreApp();

    it("adds a tile to a resource without geometry in a node, then deletes it", async () => {
        const resourceInstanceId =
            await findResourceWithoutExtent(editorSession);
        const emptyLayer = await loadResourceLayer(
            fakeApp,
            editorSession,
            resourceInstanceId,
            EXTENT_NODE,
        );
        expect(emptyLayer.baselineFeatures).toEqual([]);
        fakeApp.setLayerFeatures(emptyLayer.layerId, [
            drawnFeature(square(-0.15, 51.45)),
        ]);

        const addResult = await pushEverything(
            fakeApp,
            editorSession,
            emptyLayer,
            {
                kind: "existing-resource",
                resourceInstanceId,
                name: "Attach target",
            },
        );
        expect(addResult.failures).toEqual([]);
        expect(addResult.savedTileCount).toBe(1);

        const extentLayer = await loadResourceLayer(
            fakeApp,
            editorSession,
            resourceInstanceId,
            EXTENT_NODE,
        );
        expect(extentLayer.baselineFeatures).toHaveLength(1);

        fakeApp.setLayerFeatures(extentLayer.layerId, []);
        const deleteResult = await pushEverything(
            fakeApp,
            editorSession,
            extentLayer,
        );
        expect(deleteResult.failures).toEqual([]);
        expect(deleteResult.deletedTileCount).toBe(1);

        const finalLayer = await loadResourceLayer(
            fakeApp,
            editorSession,
            resourceInstanceId,
            EXTENT_NODE,
        );
        expect(finalLayer.baselineFeatures).toEqual([]);
    });
});

describe("finding a resource to attach to", () => {
    it("finds a resource by name", async () => {
        const resourceInstanceId = await findGeneratedResourceId(editorSession);
        const [locationFeature] = (
            await fetchNodeFeatures(
                fetch,
                editorSession,
                LOCATION_NODE.nodeid,
                {
                    resourceInstanceIds: [resourceInstanceId],
                },
            )
        ).features;
        const name = String(locationFeature.properties?.primary_name);

        const results = await searchResources(
            fetch,
            editorSession,
            LOCATION_NODE.graph_id,
            name,
        );

        expect(results).toContainEqual({ resourceInstanceId, name });
    });
});
