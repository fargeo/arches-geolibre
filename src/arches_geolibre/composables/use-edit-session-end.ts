import { onBeforeUnmount, onMounted } from "vue";

import { useGeoLibreApp } from "@/arches_geolibre/composables/use-geolibre-app.ts";

const VISIBILITY_POLL_MILLISECONDS = 1000;

/**
 * GeoLibre gives plugins no event when a GeoEditor session ends. It does hide
 * the layer being edited for the length of the session and restore it after,
 * so a layer turning visible again after being hidden marks a likely session
 * end. A user toggling visibility by hand triggers it too, which is harmless:
 * the callback only re-checks for changes.
 */
export function useEditSessionEnd(
    watchedLayerIds: () => string[],
    onSessionEnd: (layerId: string) => void,
): void {
    const geolibreApp = useGeoLibreApp();
    const previousVisibility = new Map<string, boolean>();
    let pollTimer: ReturnType<typeof setInterval> | undefined;

    function pollVisibility(): void {
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
    }

    onMounted(() => {
        pollTimer = setInterval(pollVisibility, VISIBILITY_POLL_MILLISECONDS);
    });

    onBeforeUnmount(() => {
        clearInterval(pollTimer);
    });
}
