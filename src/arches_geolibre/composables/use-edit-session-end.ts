import { onBeforeUnmount, onMounted } from "vue";

import { useGeoLibreApp } from "@/arches_geolibre/composables/use-geolibre-app.ts";
import { watchEditSessionEnds } from "@/arches_geolibre/utils/edit-sessions.ts";

/**
 * Calls `onSessionEnd` while the component is mounted whenever a GeoEditor
 * session on a watched layer ends with its edits saved.
 */
export function useEditSessionEnd(
    watchedLayerIds: () => string[],
    onSessionEnd: (layerId: string) => void,
): void {
    const geolibreApp = useGeoLibreApp();
    let stopWatching: (() => void) | undefined;

    onMounted(() => {
        stopWatching = watchEditSessionEnds(
            geolibreApp,
            watchedLayerIds,
            onSessionEnd,
        );
    });

    onBeforeUnmount(() => {
        stopWatching?.();
    });
}
