import type { Feature, FeatureCollection, Geometry } from "geojson";

import {
    readFeatureKey,
    readTileId,
} from "@/arches_geolibre/utils/feature-keys.ts";
import {
    buildTileCollection,
    toArchesTileFeature,
} from "@/arches_geolibre/utils/tile-collections.ts";

import type { FeatureChange } from "@/arches_geolibre/utils/change-detection.ts";

type ArchesFeature = Feature<Geometry | null>;

/** Where a freshly drawn feature goes when it's pushed. */
export type ChangeTarget =
    | { kind: "new-resource" }
    | { kind: "existing-resource"; resourceInstanceId: string; name: string };

export interface PendingChange {
    key: string;
    change: FeatureChange;
    isIncluded: boolean;
    /** Only used for freshly drawn features. */
    target: ChangeTarget;
}

export type PushOperation =
    | {
          kind: "save-tile";
          tileId: string;
          featureCollection: FeatureCollection<Geometry>;
      }
    | { kind: "delete-tile"; tileId: string }
    | {
          kind: "create-resource";
          featureCollection: FeatureCollection<Geometry>;
      }
    | {
          kind: "add-tile";
          resourceInstanceId: string;
          featureCollection: FeatureCollection<Geometry>;
      };

const NEW_FEATURE_KEY_PREFIX = "new:";

/** A stable key for a pending change, so choices survive a re-check. */
export function pendingChangeKey(change: FeatureChange): string {
    return (
        change.featureKey ??
        `${NEW_FEATURE_KEY_PREFIX}${String(change.feature.id ?? "")}`
    );
}

/** A feature drawn from scratch, belonging to no Arches resource yet. */
export function isFreshlyDrawn(change: FeatureChange): boolean {
    return change.kind === "created" && readTileId(change.feature) === null;
}

/** The resource a change affects, if it already exists in Arches. */
export function affectedResourceId(
    pendingChange: PendingChange,
): string | null {
    if (isFreshlyDrawn(pendingChange.change)) {
        return pendingChange.target.kind === "existing-resource"
            ? pendingChange.target.resourceInstanceId
            : null;
    }
    const resourceInstanceId =
        pendingChange.change.feature.properties?.resourceinstanceid;
    return typeof resourceInstanceId === "string" ? resourceInstanceId : null;
}

/**
 * Turns a layer's pending changes into the writes that apply them.
 *
 * Excluded changes are left out by undoing them on the way: an excluded edit
 * keeps its baseline geometry, an excluded deletion keeps its feature, and an
 * excluded copy is dropped. A drawn feature attached to an existing resource
 * joins that resource's first tile when it has one (`existingFeatures` must
 * then hold all of that resource's features in this node, including those not
 * on the map), and otherwise becomes a new tile.
 */
export function buildPushOperations(input: {
    baselineFeatures: ArchesFeature[];
    currentFeatures: ArchesFeature[];
    pendingChanges: PendingChange[];
    existingFeatures?: ArchesFeature[];
}): PushOperation[] {
    const includedChanges = input.pendingChanges.filter(
        (pendingChange) => pendingChange.isIncluded,
    );
    const featurePool = applyExclusions(
        input.baselineFeatures,
        input.currentFeatures,
        input.pendingChanges.filter(
            (pendingChange) => !pendingChange.isIncluded,
        ),
    );
    for (const existingFeature of input.existingFeatures ?? []) {
        if (
            !featurePool.some((feature) =>
                sameArchesFeature(feature, existingFeature),
            )
        ) {
            featurePool.push(existingFeature);
        }
    }

    const touchedTileIds = new Set<string>();
    const operations: PushOperation[] = [];
    const newTileFeaturesByResource = new Map<string, ArchesFeature[]>();

    for (const pendingChange of includedChanges) {
        const { change } = pendingChange;
        if (!isFreshlyDrawn(change)) {
            const tileId = readTileId(change.feature);
            if (tileId) {
                touchedTileIds.add(tileId);
            }
            continue;
        }
        removeFeature(featurePool, change.feature);
        if (pendingChange.target.kind === "new-resource") {
            operations.push({
                kind: "create-resource",
                featureCollection: {
                    type: "FeatureCollection",
                    features: [toArchesTileFeature(change.feature)],
                },
            });
            continue;
        }
        const { resourceInstanceId } = pendingChange.target;
        const targetTileId = firstTileOf(featurePool, resourceInstanceId);
        if (targetTileId) {
            featurePool.push(withTileId(change.feature, targetTileId));
            touchedTileIds.add(targetTileId);
        } else {
            const newTileFeatures =
                newTileFeaturesByResource.get(resourceInstanceId) ?? [];
            newTileFeatures.push(change.feature);
            newTileFeaturesByResource.set(resourceInstanceId, newTileFeatures);
        }
    }

    for (const tileId of touchedTileIds) {
        const featureCollection = buildTileCollection(featurePool, tileId);
        operations.unshift(
            featureCollection.features.length > 0
                ? { kind: "save-tile", tileId, featureCollection }
                : { kind: "delete-tile", tileId },
        );
    }
    for (const [resourceInstanceId, features] of newTileFeaturesByResource) {
        operations.push({
            kind: "add-tile",
            resourceInstanceId,
            featureCollection: {
                type: "FeatureCollection",
                features: features.map(toArchesTileFeature),
            },
        });
    }
    return operations;
}

function applyExclusions(
    baselineFeatures: ArchesFeature[],
    currentFeatures: ArchesFeature[],
    excludedChanges: PendingChange[],
): ArchesFeature[] {
    const featurePool = [...currentFeatures];
    for (const { change } of excludedChanges) {
        if (change.kind === "created") {
            removeFeature(featurePool, change.feature);
        } else if (change.kind === "deleted") {
            featurePool.push(change.feature);
        } else {
            const baselineFeature = baselineFeatures.find(
                (feature) => readFeatureKey(feature) === change.featureKey,
            );
            const index = featurePool.indexOf(change.feature);
            if (baselineFeature && index >= 0) {
                featurePool[index] = baselineFeature;
            }
        }
    }
    return featurePool;
}

function removeFeature(
    features: ArchesFeature[],
    feature: ArchesFeature,
): void {
    const index = features.indexOf(feature);
    if (index >= 0) {
        features.splice(index, 1);
    }
}

function firstTileOf(
    features: ArchesFeature[],
    resourceInstanceId: string,
): string | null {
    const resourceFeature = features.find(
        (feature) =>
            feature.properties?.resourceinstanceid === resourceInstanceId &&
            readTileId(feature) !== null,
    );
    return resourceFeature ? readTileId(resourceFeature) : null;
}

function withTileId(feature: ArchesFeature, tileId: string): ArchesFeature {
    return {
        ...feature,
        properties: { ...feature.properties, tileid: tileId },
    };
}

function sameArchesFeature(
    firstFeature: ArchesFeature,
    secondFeature: ArchesFeature,
): boolean {
    const firstKey = readFeatureKey(firstFeature);
    return firstKey !== null && firstKey === readFeatureKey(secondFeature);
}

/**
 * Pending changes for a fresh diff, keeping what the user already chose for
 * changes that are still there. Changes to resources the user can't edit are
 * excluded and can't be included.
 */
export function reconcilePendingChanges(
    previousChanges: PendingChange[],
    changes: FeatureChange[],
    isBlocked: (pendingChange: PendingChange) => boolean = () => false,
): PendingChange[] {
    const previousByKey = new Map(
        previousChanges.map((pendingChange) => [
            pendingChange.key,
            pendingChange,
        ]),
    );
    return changes.map((change) => {
        const key = pendingChangeKey(change);
        const previous = previousByKey.get(key);
        const pendingChange: PendingChange = {
            key,
            change,
            isIncluded: previous?.isIncluded ?? true,
            target: previous?.target ?? { kind: "new-resource" },
        };
        if (isBlocked(pendingChange)) {
            pendingChange.isIncluded = false;
        }
        return pendingChange;
    });
}
