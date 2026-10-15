import type { GeoLibreAppAPI } from "@/arches_geolibre/geolibre/host-api.ts";

const VISIBILITY_POLL_MILLISECONDS = 1000;

/**
 * Calls `onSessionEnd` when a GeoEditor session on one of the watched layers
 * ends with its edits saved, so the caller can look for new changes.
 *
 * GeoLibre after 3.4.0 reports sessions (opengeos/GeoLibre#3138). On 3.4.0
 * this falls back to watching visibility: the GeoEditor hides the layer it
 * edits and shows it again when the session ends. That fallback also fires
 * on a cancelled session or a user toggling visibility by hand, which is
 * harmless: the caller only re-checks for changes.
 *
 * @returns Stops watching.
 */
export function watchEditSessionEnds(
    geolibreApp: GeoLibreAppAPI,
    watchedLayerIds: () => string[],
    onSessionEnd: (layerId: string) => void,
): () => void {
    if (geolibreApp.onEditSessionChange) {
        return geolibreApp.onEditSessionChange((change) => {
            if (
                change.state === "ended" &&
                change.saved &&
                watchedLayerIds().includes(change.layerId)
            ) {
                onSessionEnd(change.layerId);
            }
        });
    }
    const previousVisibility = new Map<string, boolean>();
    const pollTimer = setInterval(() => {
        const layerSummaries = geolibreApp.listLayers?.() ?? [];
        for (const layerId of watchedLayerIds()) {
            const layerSummary = layerSummaries.find(
                (summary) => summary.id === layerId,
            );
            if (!layerSummary) {
                continue;
            }
            const wasVisible = previousVisibility.get(layerId);
            if (wasVisible === false && layerSummary.visible) {
                onSessionEnd(layerId);
            }
            previousVisibility.set(layerId, layerSummary.visible);
        }
    }, VISIBILITY_POLL_MILLISECONDS);
    return () => clearInterval(pollTimer);
}

/**
 * Whether the GeoEditor has the layer open. GeoLibre 3.4.0 can't say, so it
 * falls back to the layer being hidden, which the GeoEditor does while it
 * edits a layer (and which a user hiding the layer also looks like).
 */
export function isLayerBeingEdited(
    geolibreApp: GeoLibreAppAPI,
    layerId: string,
): boolean {
    if (geolibreApp.getEditSessionLayerId) {
        return geolibreApp.getEditSessionLayerId() === layerId;
    }
    return (
        geolibreApp.listLayers?.().find((summary) => summary.id === layerId)
            ?.visible === false
    );
}
