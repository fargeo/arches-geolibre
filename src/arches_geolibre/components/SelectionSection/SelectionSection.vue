<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import SelectedResource from "@/arches_geolibre/components/SelectionSection/components/SelectedResource.vue";

import { useGeoLibreApp } from "@/arches_geolibre/composables/use-geolibre-app.ts";

import type { Feature, Geometry } from "geojson";

const MAXIMUM_LISTED_RESOURCES = 10;

const geolibreApp = useGeoLibreApp();

const selectedFeatures = ref<Feature<Geometry | null>[]>([]);

let stopWatchingSelection: (() => void) | undefined;

const selectedResources = computed(() => {
    const namesByResourceId = new Map<string, string>();
    for (const feature of selectedFeatures.value) {
        const resourceInstanceId = feature.properties?.resourceinstanceid;
        if (typeof resourceInstanceId === "string") {
            namesByResourceId.set(
                resourceInstanceId,
                String(feature.properties?.primary_name ?? ""),
            );
        }
    }
    return [...namesByResourceId].map(([resourceInstanceId, name]) => ({
        resourceInstanceId,
        name,
    }));
});

onMounted(() => {
    selectedFeatures.value = geolibreApp.getSelectedFeatures?.() ?? [];
    stopWatchingSelection = geolibreApp.onSelectionChange?.((selection) => {
        selectedFeatures.value = selection.features;
    });
});

onBeforeUnmount(() => {
    stopWatchingSelection?.();
});
</script>

<template>
    <section
        v-if="selectedResources.length > 0"
        class="selection-section"
    >
        <h3>
            {{
                $ngettext(
                    "Selected resource",
                    "%{count} selected resources",
                    selectedResources.length,
                    { count: selectedResources.length },
                )
            }}
        </h3>
        <ul>
            <SelectedResource
                v-for="selectedResource in selectedResources.slice(
                    0,
                    MAXIMUM_LISTED_RESOURCES,
                )"
                :key="selectedResource.resourceInstanceId"
                :resource-instance-id="selectedResource.resourceInstanceId"
                :name="selectedResource.name"
            />
        </ul>
        <small v-if="selectedResources.length > MAXIMUM_LISTED_RESOURCES">
            {{
                $gettext("Showing the first %{count}.", {
                    count: MAXIMUM_LISTED_RESOURCES,
                })
            }}
        </small>
    </section>
</template>

<style scoped>
.selection-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

h3 {
    margin: 0;
    font-size: 1rem;
}

ul {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
}
</style>
