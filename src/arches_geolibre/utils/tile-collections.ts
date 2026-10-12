import type { Feature, FeatureCollection, Geometry } from "geojson";

import {
    ARCHES_FEATURE_ORDINAL_PROPERTY,
    readTileId,
} from "@/arches_geolibre/utils/feature-keys.ts";

type ArchesFeature = Feature<Geometry | null>;

/**
 * An Arches geometry node stores one FeatureCollection per tile, so saving a
 * change to any feature means sending that tile's whole collection.
 *
 * Returns the collection to write for `tileId`: every feature belonging to the
 * tile, in its original order, with features that joined the tile (copies,
 * split-off parts, attached drawings) appended.
 */
export function buildTileCollection(
    features: ArchesFeature[],
    tileId: string,
): FeatureCollection<Geometry> {
    const tileFeatures = features
        .filter(
            (feature) =>
                readTileId(feature) === tileId && feature.geometry !== null,
        )
        .sort(
            (firstFeature, secondFeature) =>
                readOrdinal(firstFeature) - readOrdinal(secondFeature),
        )
        .map(toArchesTileFeature);

    return {
        type: "FeatureCollection",
        features: withUniqueFeatureIds(tileFeatures),
    };
}

/** The feature shape Arches' geojson-feature-collection datatype stores. */
export function toArchesTileFeature(feature: ArchesFeature): Feature<Geometry> {
    const featureId = feature.properties?.featureid;
    return {
        type: "Feature",
        id: typeof featureId === "string" ? featureId : crypto.randomUUID(),
        geometry: feature.geometry as Geometry,
        properties: {},
    };
}

function readOrdinal(feature: ArchesFeature): number {
    const ordinal = feature.properties?.[ARCHES_FEATURE_ORDINAL_PROPERTY];
    return typeof ordinal === "number" ? ordinal : Number.MAX_SAFE_INTEGER;
}

/** A copy or split-off part inherits its source's id; give it a fresh one. */
function withUniqueFeatureIds(
    tileFeatures: Feature<Geometry>[],
): Feature<Geometry>[] {
    const usedFeatureIds = new Set<string | number>();
    return tileFeatures.map((tileFeature) => {
        const uniqueFeature =
            tileFeature.id === undefined || usedFeatureIds.has(tileFeature.id)
                ? { ...tileFeature, id: crypto.randomUUID() }
                : tileFeature;
        usedFeatureIds.add(uniqueFeature.id as string);
        return uniqueFeature;
    });
}
