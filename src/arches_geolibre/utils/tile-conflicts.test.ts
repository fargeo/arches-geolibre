import { tileMatchesLoadedFeatures } from "@/arches_geolibre/utils/tile-conflicts.ts";

import type { Feature, FeatureCollection, Geometry, Point } from "geojson";

function point(longitude: number, latitude: number): Point {
    return { type: "Point", coordinates: [longitude, latitude] };
}

function storedTile(
    ...features: [string, Geometry][]
): FeatureCollection<Geometry> {
    return {
        type: "FeatureCollection",
        features: features.map(([id, geometry]) => ({
            type: "Feature",
            id,
            geometry,
            properties: {},
        })),
    };
}

function loadedFeature(
    featureId: string,
    geometry: Geometry,
): Feature<Geometry | null> {
    return {
        type: "Feature",
        geometry,
        properties: { tileid: "tile", featureid: featureId },
    };
}

describe("tileMatchesLoadedFeatures", () => {
    it("matches an unchanged tile, whatever the order or key order", () => {
        expect(
            tileMatchesLoadedFeatures(
                storedTile(["b", point(1, 1)], ["a", point(0, 0)]),
                [
                    loadedFeature("a", { coordinates: [0, 0], type: "Point" }),
                    loadedFeature("b", point(1, 1)),
                ],
            ),
        ).toBe(true);
    });

    it("notices a moved, added or removed feature", () => {
        const loaded = [loadedFeature("a", point(0, 0))];

        expect(
            tileMatchesLoadedFeatures(storedTile(["a", point(5, 5)]), loaded),
        ).toBe(false);
        expect(
            tileMatchesLoadedFeatures(
                storedTile(["a", point(0, 0)], ["b", point(1, 1)]),
                loaded,
            ),
        ).toBe(false);
        expect(tileMatchesLoadedFeatures(storedTile(), loaded)).toBe(false);
    });

    it("treats a cleared tile as matching nothing loaded", () => {
        expect(tileMatchesLoadedFeatures(null, [])).toBe(true);
    });
});
