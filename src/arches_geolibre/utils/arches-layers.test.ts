import { featureBounds } from "@/arches_geolibre/utils/arches-layers.ts";

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
