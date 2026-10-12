import { detectFeatureChanges } from "@/arches_geolibre/utils/change-detection.ts";
import { tagArchesFeatures } from "@/arches_geolibre/utils/feature-keys.ts";
import { buildChangedTileCollections } from "@/arches_geolibre/utils/tile-collections.ts";

import type { Feature, FeatureCollection, Geometry, Point } from "geojson";

const FIRST_TILE_ID = "11111111-1111-1111-1111-111111111111";
const SECOND_TILE_ID = "22222222-2222-2222-2222-222222222222";

function point(longitude: number, latitude: number): Point {
    return { type: "Point", coordinates: [longitude, latitude] };
}

function archesFeature(
    tileId: string,
    geometry: Geometry,
): Feature<Geometry | null> {
    return {
        type: "Feature",
        geometry,
        properties: { tileid: tileId, nodeid: "node", resourceinstanceid: "r" },
    };
}

function loadBaseline(): Feature<Geometry | null>[] {
    const loadedCollection: FeatureCollection<Geometry | null> = {
        type: "FeatureCollection",
        features: [
            archesFeature(FIRST_TILE_ID, point(0, 0)),
            archesFeature(FIRST_TILE_ID, point(1, 1)),
            archesFeature(SECOND_TILE_ID, point(2, 2)),
        ],
    };
    return tagArchesFeatures(loadedCollection).features;
}

function withGeometry(
    feature: Feature<Geometry | null>,
    geometry: Geometry,
): Feature<Geometry | null> {
    return { ...feature, geometry };
}

describe("tagArchesFeatures", () => {
    it("keys features by tile and position within the tile", () => {
        const keys = loadBaseline().map(
            (feature) => feature.properties?.arches_feature_key,
        );
        expect(keys).toEqual([
            `${FIRST_TILE_ID}:0`,
            `${FIRST_TILE_ID}:1`,
            `${SECOND_TILE_ID}:0`,
        ]);
    });
});

describe("detectFeatureChanges", () => {
    it("reports nothing when the layer is unchanged", () => {
        const baseline = loadBaseline();
        expect(
            detectFeatureChanges(baseline, structuredClone(baseline)),
        ).toEqual([]);
    });

    it("ignores geometries rewritten with their keys in another order", () => {
        const baseline = loadBaseline();
        const rewrittenFeatures = baseline.map((feature) => ({
            ...feature,
            geometry: {
                coordinates: (feature.geometry as Point).coordinates,
                type: "Point" as const,
            },
        }));
        expect(detectFeatureChanges(baseline, rewrittenFeatures)).toEqual([]);
    });

    it("classifies updates, deletions, new drawings and copies", () => {
        const baseline = loadBaseline();
        const [firstFeature, secondFeature, thirdFeature] = baseline;
        const movedFeature = withGeometry(firstFeature, point(5, 5));
        const copiedFeature = withGeometry(thirdFeature, point(9, 9));
        const drawnFeature: Feature<Geometry | null> = {
            type: "Feature",
            geometry: point(7, 7),
            properties: {},
        };

        const changes = detectFeatureChanges(baseline, [
            movedFeature,
            thirdFeature,
            copiedFeature,
            drawnFeature,
        ]);

        expect(
            changes.map((change) => [change.kind, change.featureKey]),
        ).toEqual([
            ["updated", `${FIRST_TILE_ID}:0`],
            ["created", null],
            ["created", null],
            ["deleted", `${FIRST_TILE_ID}:1`],
        ]);
        expect(changes[3].feature).toBe(secondFeature);
    });
});

describe("buildChangedTileCollections", () => {
    it("rebuilds only touched tiles, in stored order, without deleted features", () => {
        const baseline = loadBaseline();
        const [firstFeature, , thirdFeature] = baseline;
        const movedFeature = withGeometry(firstFeature, point(5, 5));
        const currentFeatures = [thirdFeature, movedFeature];

        const collections = buildChangedTileCollections(
            currentFeatures,
            detectFeatureChanges(baseline, currentFeatures),
        );

        expect([...collections.keys()]).toEqual([FIRST_TILE_ID]);
        expect(
            collections
                .get(FIRST_TILE_ID)
                ?.features.map((feature) => feature.geometry),
        ).toEqual([point(5, 5)]);
    });

    it("empties a tile whose only feature was deleted", () => {
        const baseline = loadBaseline();
        const currentFeatures = baseline.slice(0, 2);

        const collections = buildChangedTileCollections(
            currentFeatures,
            detectFeatureChanges(baseline, currentFeatures),
        );

        expect(collections.get(SECOND_TILE_ID)?.features).toEqual([]);
    });

    it("keeps a copied or split-off part on the tile it came from", () => {
        const baseline = loadBaseline();
        const [firstFeature, secondFeature, thirdFeature] = baseline;
        const splitOffPart = withGeometry(thirdFeature, point(3, 3));
        const drawnFeature: Feature<Geometry | null> = {
            type: "Feature",
            geometry: point(7, 7),
            properties: {},
        };
        const currentFeatures = [
            firstFeature,
            secondFeature,
            thirdFeature,
            splitOffPart,
            drawnFeature,
        ];

        const collections = buildChangedTileCollections(
            currentFeatures,
            detectFeatureChanges(baseline, currentFeatures),
        );

        expect([...collections.keys()]).toEqual([SECOND_TILE_ID]);
        expect(
            collections
                .get(SECOND_TILE_ID)
                ?.features.map((feature) => feature.geometry),
        ).toEqual([point(2, 2), point(3, 3)]);
    });
});
