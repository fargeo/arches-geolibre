import {
    deleteTile,
    fetchEmptyGeometryTileId,
    fetchGeometryByResource,
    saveTileGeometry,
    searchResourcePage,
} from "@/arches_geolibre/utils/arches-client.ts";

import {
    FakeGeoLibreApp,
    LOCATION_NODE,
    EDITOR_USERNAME,
    pushEverything,
    signIn,
} from "./support.ts";

import type {
    ArchesSession,
    LoadedArchesLayer,
} from "@/arches_geolibre/types.ts";

// The generator's unlocated resources (test-instance README) have names but
// no Location. Even-numbered ones have an empty Location tile; odd-numbered
// ones have no Location tile at all. These two are kept for this suite; the
// demo uses 90001 and 90002.
const NO_LOCATION_TILE = "Foundry 90297";
const EMPTY_LOCATION_TILE = "Pottery 90298";
const UNLOCATED_NAME = /^(Tannery|Brewery|Foundry|Pottery) 9\d{4}$/;

let editorSession: ArchesSession;

beforeAll(async () => {
    editorSession = await signIn(EDITOR_USERNAME);
});

async function findUnlocatedResource(name: string): Promise<string> {
    const searchPage = await searchResourcePage(fetch, editorSession, {
        graphId: LOCATION_NODE.graph_id,
        text: name,
        missingGeometryNodeId: LOCATION_NODE.nodeid,
    });
    const match = searchPage.results.find((result) => result.name === name);
    if (!match) {
        throw new Error(
            `${name} isn't an unlocated resource; rebuild the test data or undo the last run.`,
        );
    }
    return match.resourceInstanceId;
}

/** A worklist layer for one resource, with a feature drawn for it. */
function worklistLayerWithDrawing(
    fakeApp: FakeGeoLibreApp,
    resourceInstanceId: string,
): LoadedArchesLayer {
    const layerId = crypto.randomUUID();
    fakeApp.setLayerFeatures(layerId, [
        {
            type: "Feature",
            id: crypto.randomUUID(),
            geometry: { type: "Point", coordinates: [-0.0751, 51.4995] },
            properties: {},
        },
    ]);
    return {
        key: layerId,
        layerId,
        node: LOCATION_NODE,
        source: {
            kind: "worklist",
            resourceInstanceIds: [resourceInstanceId],
        },
        isWritable: true,
        baselineFeatures: [],
        contentRevision: 0,
    };
}

async function locationTileIds(resourceInstanceId: string): Promise<string[]> {
    const response = await fetch(
        `${editorSession.instanceUrl}/resources/${resourceInstanceId}?format=arches-json`,
        { headers: { Authorization: `Bearer ${editorSession.accessToken}` } },
    );
    const resource = (await response.json()) as {
        tiles: { tileid: string; nodegroup_id: string }[];
    };
    return resource.tiles
        .filter((tile) => tile.nodegroup_id === LOCATION_NODE.nodegroup_id)
        .map((tile) => tile.tileid);
}

describe("resources with no geometry", () => {
    it("lists a model's resources with no geometry in a node", async () => {
        const searchPage = await searchResourcePage(fetch, editorSession, {
            graphId: LOCATION_NODE.graph_id,
            missingGeometryNodeId: LOCATION_NODE.nodeid,
        });

        expect(searchPage.totalCount).toBeGreaterThan(0);
        expect(searchPage.results.length).toBeGreaterThan(0);
        for (const result of searchPage.results) {
            expect(result.name).toMatch(UNLOCATED_NAME);
        }
        const geometryByResource = await fetchGeometryByResource(
            fetch,
            editorSession,
            LOCATION_NODE.nodeid,
            searchPage.results.map((result) => result.resourceInstanceId),
        );
        expect(geometryByResource.size).toBe(0);
    });

    it("gives geometry to a resource with no tile for it", async () => {
        const resourceInstanceId =
            await findUnlocatedResource(NO_LOCATION_TILE);
        const fakeApp = new FakeGeoLibreApp();

        const pushResult = await pushEverything(
            fakeApp,
            editorSession,
            worklistLayerWithDrawing(fakeApp, resourceInstanceId),
            {
                kind: "existing-resource",
                resourceInstanceId,
                name: NO_LOCATION_TILE,
            },
        );

        try {
            expect(pushResult.failures).toEqual([]);
            expect(pushResult.savedTileCount).toBe(1);
            const geometryByResource = await fetchGeometryByResource(
                fetch,
                editorSession,
                LOCATION_NODE.nodeid,
                [resourceInstanceId],
            );
            expect(geometryByResource.get(resourceInstanceId)).toHaveLength(1);
            expect(await locationTileIds(resourceInstanceId)).toHaveLength(1);
        } finally {
            for (const tileId of await locationTileIds(resourceInstanceId)) {
                await deleteTile(fetch, editorSession, tileId);
            }
        }
    });

    it("fills an empty tile rather than adding another beside it", async () => {
        const resourceInstanceId =
            await findUnlocatedResource(EMPTY_LOCATION_TILE);
        const emptyTileId = await fetchEmptyGeometryTileId(
            fetch,
            editorSession,
            resourceInstanceId,
            LOCATION_NODE,
        );
        expect(emptyTileId).not.toBeNull();
        const fakeApp = new FakeGeoLibreApp();

        const pushResult = await pushEverything(
            fakeApp,
            editorSession,
            worklistLayerWithDrawing(fakeApp, resourceInstanceId),
            {
                kind: "existing-resource",
                resourceInstanceId,
                name: EMPTY_LOCATION_TILE,
            },
        );

        try {
            expect(pushResult.failures).toEqual([]);
            expect(await locationTileIds(resourceInstanceId)).toEqual([
                emptyTileId,
            ]);
            const geometryByResource = await fetchGeometryByResource(
                fetch,
                editorSession,
                LOCATION_NODE.nodeid,
                [resourceInstanceId],
            );
            expect(
                geometryByResource.get(resourceInstanceId)?.[0].properties
                    ?.tileid,
            ).toBe(emptyTileId);
        } finally {
            await saveTileGeometry(fetch, editorSession, {
                nodeId: LOCATION_NODE.nodeid,
                tileId: emptyTileId!,
                featureCollection: { type: "FeatureCollection", features: [] },
                transactionId: crypto.randomUUID(),
            });
        }
    });
});
