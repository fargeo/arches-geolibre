import type { Feature, FeatureCollection, Geometry } from "geojson";

export const ARCHES_FEATURE_KEY_PROPERTY = "arches_feature_key";
export const ARCHES_FEATURE_ORDINAL_PROPERTY = "arches_feature_ordinal";

type ArchesFeature = Feature<Geometry | null>;

export function readFeatureKey(feature: ArchesFeature): string | null {
    const featureKey = feature.properties?.[ARCHES_FEATURE_KEY_PROPERTY];
    return typeof featureKey === "string" ? featureKey : null;
}

export function readTileId(feature: ArchesFeature): string | null {
    const tileId = feature.properties?.tileid;
    return typeof tileId === "string" ? tileId : null;
}

/**
 * Gives every feature a stable key back to the Arches tile it came from.
 *
 * Arches' /geojson endpoint replaces each feature's UUID with a running
 * number, so until it reports `featureid` the key falls back to the feature's
 * position within its tile. That position is stable because /geojson emits a
 * tile's features in stored order.
 */
export function tagArchesFeatures<FeatureGeometry extends Geometry | null>(
    featureCollection: FeatureCollection<FeatureGeometry>,
): FeatureCollection<FeatureGeometry> {
    const ordinalsByTileId = new Map<string, number>();

    const taggedFeatures = featureCollection.features.map((feature) => {
        const tileId = readTileId(feature);
        const ordinal = tileId ? (ordinalsByTileId.get(tileId) ?? 0) : 0;
        if (tileId) {
            ordinalsByTileId.set(tileId, ordinal + 1);
        }

        const featureId = feature.properties?.featureid;
        const featureKey =
            typeof featureId === "string"
                ? `${tileId}:${featureId}`
                : `${tileId}:${ordinal}`;

        return {
            ...feature,
            properties: {
                ...feature.properties,
                [ARCHES_FEATURE_KEY_PROPERTY]: featureKey,
                [ARCHES_FEATURE_ORDINAL_PROPERTY]: ordinal,
            },
        };
    });

    return { ...featureCollection, features: taggedFeatures };
}
