import type { Feature, FeatureCollection, Geometry } from "geojson";

import {
    ARCHES_FEATURE_ORDINAL_PROPERTY,
    readTileId,
} from "@/arches_geolibre/utils/feature-keys.ts";

import type { FeatureChange } from "@/arches_geolibre/utils/change-detection.ts";

type ArchesFeature = Feature<Geometry | null>;

/**
 * An Arches geometry node stores one FeatureCollection per tile, so saving a
 * change to any feature means sending that tile's whole collection.
 *
 * Returns, for each tile touched by `changes`, the collection to write: every
 * current feature belonging to the tile, in its original order, with edited
 * geometries in place, deleted features left out, and copies or split-off
 * parts of the tile's features appended. A tile whose features were all
 * deleted maps to an empty collection. Freshly drawn features belong to no
 * tile and are left for the caller.
 */
export function buildChangedTileCollections(
    currentFeatures: ArchesFeature[],
    changes: FeatureChange[],
): Map<string, FeatureCollection<Geometry>> {
    const changedTileIds = new Set<string>();
    for (const change of changes) {
        const tileId = readTileId(change.feature);
        if (tileId) {
            changedTileIds.add(tileId);
        }
    }

    const collections = new Map<string, FeatureCollection<Geometry>>();
    for (const tileId of changedTileIds) {
        const tileFeatures = currentFeatures
            .filter(
                (feature) =>
                    readTileId(feature) === tileId && feature.geometry !== null,
            )
            .sort(
                (firstFeature, secondFeature) =>
                    readOrdinal(firstFeature) - readOrdinal(secondFeature),
            )
            .map(toArchesTileFeature);

        collections.set(tileId, {
            type: "FeatureCollection",
            features: withUniqueFeatureIds(tileFeatures),
        });
    }

    return collections;
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
        if (
            tileFeature.id === undefined ||
            usedFeatureIds.has(tileFeature.id)
        ) {
            tileFeature = { ...tileFeature, id: crypto.randomUUID() };
        }
        usedFeatureIds.add(tileFeature.id as string);
        return tileFeature;
    });
}
