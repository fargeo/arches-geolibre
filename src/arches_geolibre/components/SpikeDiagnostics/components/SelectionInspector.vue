<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

import { useGeoLibreApp } from "@/arches_geolibre/composables/use-geolibre-app.ts";

import type { GeoLibreSelection } from "@/arches_geolibre/geolibre/host-api.ts";

const geolibreApp = useGeoLibreApp();

const selectionDump = ref("");

let unsubscribe: (() => void) | undefined;

onMounted(() => {
    unsubscribe = geolibreApp.onSelectionChange?.(describeSelection);
});

onBeforeUnmount(() => {
    unsubscribe?.();
});

function describeSelection(selection: GeoLibreSelection): void {
    const identities = selection.features.map((feature) => ({
        id: feature.id,
        properties: feature.properties,
    }));
    selectionDump.value = JSON.stringify(
        { layerId: selection.layerId, features: identities },
        null,
        2,
    );
}
</script>

<template>
    <section>
        <h4>Selected features</h4>
        <pre v-if="selectionDump">{{ selectionDump }}</pre>
        <p v-else>
            Select features on an Arches layer to see their ids and properties.
        </p>
    </section>
</template>

<style scoped>
h4 {
    margin: 0 0 0.25rem;
}

pre {
    max-height: 16rem;
    margin: 0;
    overflow: auto;
    font-size: 0.75rem;
    white-space: pre-wrap;
}
</style>
