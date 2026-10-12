import { fetchTile } from "@/arches_geolibre/utils/arches-client.ts";

import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { ArchesSession } from "@/arches_geolibre/types.ts";

/** A tile holding one of the user's provisional edits. */
export interface TrackedReviewTile {
    tileId: string;
    nodeId: string;
}

const STORAGE_KEY_PREFIX = "arches-geolibre:awaiting-review";

/**
 * Arches has no query for "my provisional edits", so the plugin remembers the
 * tiles each user pushed provisionally. Browser storage is enough: losing it
 * only hides the overlay, never the edits themselves.
 */
export function loadTrackedReviewTiles(
    session: ArchesSession,
): TrackedReviewTile[] {
    try {
        const stored = window.localStorage.getItem(storageKey(session));
        return stored ? (JSON.parse(stored) as TrackedReviewTile[]) : [];
    } catch {
        return [];
    }
}

export function saveTrackedReviewTiles(
    session: ArchesSession,
    trackedTiles: TrackedReviewTile[],
): void {
    try {
        window.localStorage.setItem(
            storageKey(session),
            JSON.stringify(trackedTiles),
        );
    } catch {
        // The overlay is a convenience; without storage it lasts the session.
    }
}

export function mergeTrackedReviewTiles(
    trackedTiles: TrackedReviewTile[],
    newTiles: TrackedReviewTile[],
): TrackedReviewTile[] {
    const tilesById = new Map(
        [...trackedTiles, ...newTiles].map((tile) => [tile.tileId, tile]),
    );
    return [...tilesById.values()];
}

/**
 * The geometry of the user's edits still awaiting review, and the tiles that
 * still hold one. A tile drops out once a reviewer accepts or rejects the
 * edit, or the tile is deleted.
 */
export async function fetchOwnPendingFeatures(
    fetchImplementation: typeof fetch,
    session: ArchesSession,
    trackedTiles: TrackedReviewTile[],
): Promise<{
    features: Feature<Geometry>[];
    stillPending: TrackedReviewTile[];
}> {
    const features: Feature<Geometry>[] = [];
    const stillPending: TrackedReviewTile[] = [];

    for (const trackedTile of trackedTiles) {
        const tile = await fetchTile(
            fetchImplementation,
            session,
            trackedTile.tileId,
        );
        const provisionalEdit =
            tile?.provisionaledits?.[String(session.userId)];
        if (!tile || provisionalEdit?.status !== "review") {
            continue;
        }
        stillPending.push(trackedTile);
        const pendingValue = provisionalEdit.value[trackedTile.nodeId] as
            FeatureCollection<Geometry> | null | undefined;
        for (const feature of pendingValue?.features ?? []) {
            features.push({
                ...feature,
                properties: {
                    tileid: tile.tileid,
                    resourceinstanceid: tile.resourceinstance_id,
                    review_status: "awaiting review",
                },
            });
        }
    }
    return { features, stillPending };
}

function storageKey(session: ArchesSession): string {
    return `${STORAGE_KEY_PREFIX}:${session.instanceUrl}:${session.username}`;
}
