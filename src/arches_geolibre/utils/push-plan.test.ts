import { detectFeatureChanges } from "@/arches_geolibre/utils/change-detection.ts";
import { tagArchesFeatures } from "@/arches_geolibre/utils/feature-keys.ts";
import {
    buildPushOperations,
    pendingChangeKey,
    reconcilePendingChanges,
} from "@/arches_geolibre/utils/push-plan.ts";

import type { Feature, Geometry, Point } from "geojson";
import type {
    ChangeTarget,
    PendingChange,
    PushOperation,
} from "@/arches_geolibre/utils/push-plan.ts";

const FIRST_TILE_ID = "first-tile";
const SECOND_TILE_ID = "second-tile";
const FIRST_RESOURCE_ID = "first-resource";
const SECOND_RESOURCE_ID = "second-resource";

type ArchesFeature = Feature<Geometry | null>;

function point(longitude: number, latitude: number): Point {
    return { type: "Point", coordinates: [longitude, latitude] };
}

function archesFeature(
    tileId: string,
    resourceInstanceId: string,
    geometry: Geometry,
): ArchesFeature {
    return {
        type: "Feature",
        geometry,
        properties: { tileid: tileId, resourceinstanceid: resourceInstanceId },
    };
}

function drawnFeature(geometry: Geometry, id: string): ArchesFeature {
    return { type: "Feature", id, geometry, properties: {} };
}

function loadBaseline(): ArchesFeature[] {
    return tagArchesFeatures({
        type: "FeatureCollection",
        features: [
            archesFeature(FIRST_TILE_ID, FIRST_RESOURCE_ID, point(0, 0)),
            archesFeature(FIRST_TILE_ID, FIRST_RESOURCE_ID, point(1, 1)),
            archesFeature(SECOND_TILE_ID, SECOND_RESOURCE_ID, point(2, 2)),
        ],
    }).features;
}

function withGeometry(
    feature: ArchesFeature,
    geometry: Geometry,
): ArchesFeature {
    return { ...feature, geometry };
}

function planFor(
    baselineFeatures: ArchesFeature[],
    currentFeatures: ArchesFeature[],
    options: {
        excludedKeys?: string[];
        targets?: Record<string, ChangeTarget>;
        existingFeatures?: ArchesFeature[];
    } = {},
): PushOperation[] {
    const pendingChanges: PendingChange[] = detectFeatureChanges(
        baselineFeatures,
        currentFeatures,
    ).map((change) => {
        const key = pendingChangeKey(change);
        return {
            key,
            change,
            isIncluded: !options.excludedKeys?.includes(key),
            target: options.targets?.[key] ?? { kind: "new-resource" },
        };
    });
    return buildPushOperations({
        baselineFeatures,
        currentFeatures,
        pendingChanges,
        existingFeatures: options.existingFeatures,
    });
}

function geometriesOf(operation: PushOperation | undefined): Geometry[] {
    return operation && "featureCollection" in operation
        ? operation.featureCollection.features.map(
              (feature) => feature.geometry,
          )
        : [];
}

describe("buildPushOperations", () => {
    it("rewrites only touched tiles, in stored order, without deleted features", () => {
        const baseline = loadBaseline();
        const [firstFeature, , thirdFeature] = baseline;

        const operations = planFor(baseline, [
            thirdFeature,
            withGeometry(firstFeature, point(5, 5)),
        ]);

        expect(operations).toHaveLength(1);
        expect(operations[0]).toMatchObject({
            kind: "save-tile",
            tileId: FIRST_TILE_ID,
        });
        expect(geometriesOf(operations[0])).toEqual([point(5, 5)]);
    });

    it("deletes a tile whose only feature was deleted", () => {
        const baseline = loadBaseline();

        expect(planFor(baseline, baseline.slice(0, 2))).toEqual([
            { kind: "delete-tile", tileId: SECOND_TILE_ID },
        ]);
    });

    it("keeps a copied or split-off part on the tile it came from", () => {
        const baseline = loadBaseline();
        const thirdFeature = baseline[2];

        const operations = planFor(baseline, [
            ...baseline,
            withGeometry(thirdFeature, point(3, 3)),
        ]);

        expect(operations).toHaveLength(1);
        expect(geometriesOf(operations[0])).toEqual([point(2, 2), point(3, 3)]);
    });

    it("leaves excluded changes as they were in Arches", () => {
        const baseline = loadBaseline();
        const [firstFeature, secondFeature] = baseline;
        const movedFirstFeature = withGeometry(firstFeature, point(5, 5));
        const movedSecondFeature = withGeometry(secondFeature, point(6, 6));

        const operations = planFor(
            baseline,
            [movedFirstFeature, movedSecondFeature],
            {
                excludedKeys: [
                    pendingChangeKey({
                        kind: "updated",
                        featureKey: `${FIRST_TILE_ID}:0`,
                        feature: movedFirstFeature,
                    }),
                    `${SECOND_TILE_ID}:0`,
                ],
            },
        );

        expect(operations).toHaveLength(1);
        expect(geometriesOf(operations[0])).toEqual([point(0, 0), point(6, 6)]);
    });

    it("creates a resource for each freshly drawn feature by default", () => {
        const baseline = loadBaseline();

        const operations = planFor(baseline, [
            ...baseline,
            drawnFeature(point(7, 7), "0"),
            drawnFeature(point(8, 8), "1"),
        ]);

        expect(operations.map((operation) => operation.kind)).toEqual([
            "create-resource",
            "create-resource",
        ]);
    });

    it("attaches a drawn feature to the first tile of a resource on the map", () => {
        const baseline = loadBaseline();

        const operations = planFor(
            baseline,
            [...baseline, drawnFeature(point(9, 9), "0")],
            {
                targets: {
                    "new:0": {
                        kind: "existing-resource",
                        resourceInstanceId: FIRST_RESOURCE_ID,
                        name: "First",
                    },
                },
            },
        );

        expect(operations).toHaveLength(1);
        expect(operations[0]).toMatchObject({ tileId: FIRST_TILE_ID });
        expect(geometriesOf(operations[0])).toEqual([
            point(0, 0),
            point(1, 1),
            point(9, 9),
        ]);
    });

    it("keeps an off-map resource's features when attaching to its tile", () => {
        const baseline = loadBaseline();
        const offMapFeatures = tagArchesFeatures({
            type: "FeatureCollection",
            features: [archesFeature("off-map-tile", "off-map", point(4, 4))],
        }).features;

        const operations = planFor(
            baseline,
            [...baseline, drawnFeature(point(9, 9), "0")],
            {
                targets: {
                    "new:0": {
                        kind: "existing-resource",
                        resourceInstanceId: "off-map",
                        name: "Off map",
                    },
                },
                existingFeatures: offMapFeatures,
            },
        );

        expect(operations).toHaveLength(1);
        expect(operations[0]).toMatchObject({ tileId: "off-map-tile" });
        expect(geometriesOf(operations[0])).toEqual([point(4, 4), point(9, 9)]);
    });

    it("adds a tile to a resource that has no geometry in this node", () => {
        const operations = planFor([], [drawnFeature(point(9, 9), "0")], {
            targets: {
                "new:0": {
                    kind: "existing-resource",
                    resourceInstanceId: "without-geometry",
                    name: "Without geometry",
                },
            },
        });

        expect(operations).toEqual([
            {
                kind: "add-tile",
                resourceInstanceId: "without-geometry",
                featureCollection: {
                    type: "FeatureCollection",
                    features: [
                        expect.objectContaining({ geometry: point(9, 9) }),
                    ],
                },
            },
        ]);
    });
});

describe("reconcilePendingChanges", () => {
    it("keeps earlier choices and excludes blocked changes", () => {
        const baseline = loadBaseline();
        const [firstFeature, secondFeature] = baseline;
        const changes = detectFeatureChanges(baseline, [
            withGeometry(firstFeature, point(5, 5)),
            withGeometry(secondFeature, point(6, 6)),
            baseline[2],
            drawnFeature(point(9, 9), "0"),
        ]);
        const attachTarget: ChangeTarget = {
            kind: "existing-resource",
            resourceInstanceId: SECOND_RESOURCE_ID,
            name: "Second",
        };
        const previous = reconcilePendingChanges([], changes).map(
            (pendingChange) =>
                pendingChange.key === `${FIRST_TILE_ID}:0`
                    ? { ...pendingChange, isIncluded: false }
                    : pendingChange.key === "new:0"
                      ? { ...pendingChange, target: attachTarget }
                      : pendingChange,
        );

        const reconciled = reconcilePendingChanges(
            previous,
            changes,
            (pendingChange) => pendingChange.key === `${FIRST_TILE_ID}:1`,
        );

        expect(
            reconciled.map((pendingChange) => [
                pendingChange.key,
                pendingChange.isIncluded,
                pendingChange.target.kind,
            ]),
        ).toEqual([
            [`${FIRST_TILE_ID}:0`, false, "new-resource"],
            [`${FIRST_TILE_ID}:1`, false, "new-resource"],
            ["new:0", true, "existing-resource"],
        ]);
    });
});
