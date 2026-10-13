import { onBeforeUnmount, onMounted, ref } from "vue";

import { useGeoLibreApp } from "@/arches_geolibre/composables/use-geolibre-app.ts";

import type { GeoLibreSelection } from "@/arches_geolibre/geolibre/host-api.ts";

/** GeoLibre's current feature selection, kept up to date. */
export function useGeoLibreSelection() {
    const geolibreApp = useGeoLibreApp();
    const selection = ref<GeoLibreSelection>({ layerId: null, features: [] });

    let stopWatchingSelection: (() => void) | undefined;

    onMounted(() => {
        selection.value = {
            layerId: geolibreApp.getSelectedLayerId?.() ?? null,
            features: geolibreApp.getSelectedFeatures?.() ?? [],
        };
        stopWatchingSelection = geolibreApp.onSelectionChange?.(
            (changedSelection) => {
                selection.value = changedSelection;
            },
        );
    });

    onBeforeUnmount(() => {
        stopWatchingSelection?.();
    });

    return selection;
}
