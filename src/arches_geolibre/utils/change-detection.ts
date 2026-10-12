import type { Feature, Geometry } from "geojson";

import { readFeatureKey } from "@/arches_geolibre/utils/feature-keys.ts";

type ArchesFeature = Feature<Geometry | null>;

export type FeatureChangeKind = "created" | "updated" | "deleted";

export interface FeatureChange {
    kind: FeatureChangeKind;
    featureKey: string | null;
    feature: ArchesFeature;
}

/**
 * Compares a layer's features after a GeoEditor session with the baseline
 * loaded from Arches, matching on the Arches feature key.
 *
 * A feature with no key, or a second feature carrying a key that is already
 * taken (what a copy or split leaves behind), counts as created.
 */
export function detectFeatureChanges(
    baselineFeatures: ArchesFeature[],
    currentFeatures: ArchesFeature[],
): FeatureChange[] {
    const baselineByKey = new Map<string, ArchesFeature>();
    for (const baselineFeature of baselineFeatures) {
        const featureKey = readFeatureKey(baselineFeature);
        if (featureKey) {
            baselineByKey.set(featureKey, baselineFeature);
        }
    }

    const changes: FeatureChange[] = [];
    const matchedKeys = new Set<string>();

    for (const currentFeature of currentFeatures) {
        const featureKey = readFeatureKey(currentFeature);
        const baselineFeature = featureKey
            ? baselineByKey.get(featureKey)
            : undefined;

        if (!featureKey || !baselineFeature || matchedKeys.has(featureKey)) {
            changes.push({
                kind: "created",
                featureKey: null,
                feature: currentFeature,
            });
            continue;
        }

        matchedKeys.add(featureKey);
        if (
            !geometriesAreEqual(
                baselineFeature.geometry,
                currentFeature.geometry,
            )
        ) {
            changes.push({
                kind: "updated",
                featureKey,
                feature: currentFeature,
            });
        }
    }

    for (const [featureKey, baselineFeature] of baselineByKey) {
        if (!matchedKeys.has(featureKey)) {
            changes.push({
                kind: "deleted",
                featureKey,
                feature: baselineFeature,
            });
        }
    }

    return changes;
}

function geometriesAreEqual(
    firstGeometry: Geometry | null,
    secondGeometry: Geometry | null,
): boolean {
    return canonicalJson(firstGeometry) === canonicalJson(secondGeometry);
}

/** GeoLibre's editor rewrites geometries with keys in a different order. */
function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map(canonicalJson).join(",")}]`;
    }
    if (value !== null && typeof value === "object") {
        const sortedEntries = Object.entries(value).sort(
            ([firstKey], [secondKey]) => firstKey.localeCompare(secondKey),
        );
        return `{${sortedEntries
            .map(
                ([key, entryValue]) =>
                    `${JSON.stringify(key)}:${canonicalJson(entryValue)}`,
            )
            .join(",")}}`;
    }
    return JSON.stringify(value);
}
