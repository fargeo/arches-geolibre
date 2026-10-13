import type { Feature, Geometry } from "geojson";

const ARCHES_GEOMETRY_TYPES = new Set<Geometry["type"]>([
    "Point",
    "MultiPoint",
    "LineString",
    "MultiLineString",
    "Polygon",
    "MultiPolygon",
]);

/**
 * Copies of features from another GeoLibre layer, ready to become an Arches
 * resource's geometry: the source's attributes are left behind, and each copy
 * gets a new id so it's detected as freshly drawn. Features with no geometry,
 * or a geometry type Arches doesn't store, are skipped.
 */
export function copyFeaturesForArches(features: Feature<Geometry | null>[]): {
    copies: Feature<Geometry>[];
    skippedCount: number;
} {
    const copies = features
        .filter(
            (feature): feature is Feature<Geometry> =>
                feature.geometry !== null &&
                ARCHES_GEOMETRY_TYPES.has(feature.geometry.type),
        )
        .map((feature) => ({
            type: "Feature" as const,
            id: crypto.randomUUID(),
            // A JSON round trip, because the selection may be a reactive proxy,
            // which structuredClone rejects.
            geometry: JSON.parse(JSON.stringify(feature.geometry)) as Geometry,
            properties: {},
        }));
    return { copies, skippedCount: features.length - copies.length };
}
