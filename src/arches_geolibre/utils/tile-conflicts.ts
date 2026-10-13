import { geometriesAreEqual } from "@/arches_geolibre/utils/change-detection.ts";
import { readTileId } from "@/arches_geolibre/utils/feature-keys.ts";

import type { Feature, FeatureCollection, Geometry } from "geojson";

type ArchesFeature = Feature<Geometry | null>;

/** A tile that changed in Arches after the layer was loaded. */
export interface TileConflict {
    tileId: string;
    resourceInstanceId: string | null;
    resourceName: string | null;
}

/**
 * Whether a tile's stored geometry is still what the layer loaded: the same
 * features (matched by Arches feature id) with the same geometries. Someone
 * else's provisional edit leaves the stored geometry alone, so it isn't a
 * change here.
 */
export function tileMatchesLoadedFeatures(
    storedValue: FeatureCollection<Geometry> | null | undefined,
    loadedFeatures: ArchesFeature[],
): boolean {
    const storedFeatures = (storedValue?.features ?? []).map((feature) => ({
        featureId: String(feature.id ?? ""),
        geometry: feature.geometry,
    }));
    const loaded = loadedFeatures.map((feature) => ({
        featureId: String(feature.properties?.featureid ?? ""),
        geometry: feature.geometry,
    }));
    if (storedFeatures.length !== loaded.length) {
        return false;
    }
    const byFeatureId = (
        first: { featureId: string },
        second: { featureId: string },
    ): number => first.featureId.localeCompare(second.featureId);
    storedFeatures.sort(byFeatureId);
    loaded.sort(byFeatureId);
    return storedFeatures.every(
        (storedFeature, index) =>
            storedFeature.featureId === loaded[index].featureId &&
            geometriesAreEqual(storedFeature.geometry, loaded[index].geometry),
    );
}

/** The features a layer loaded for one tile, and whose resource it is. */
export function loadedTileFeatures(
    features: ArchesFeature[],
    tileId: string,
): { features: ArchesFeature[]; conflict: TileConflict } {
    const tileFeatures = features.filter(
        (feature) => readTileId(feature) === tileId,
    );
    const properties = tileFeatures[0]?.properties;
    return {
        features: tileFeatures,
        conflict: {
            tileId,
            resourceInstanceId:
                typeof properties?.resourceinstanceid === "string"
                    ? properties.resourceinstanceid
                    : null,
            resourceName:
                typeof properties?.primary_name === "string"
                    ? properties.primary_name
                    : null,
        },
    };
}
