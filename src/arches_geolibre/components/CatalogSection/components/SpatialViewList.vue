<script setup lang="ts">
import CatalogEntry from "@/arches_geolibre/components/CatalogSection/components/CatalogEntry.vue";

import type { ArchesSpatialView } from "@/arches_geolibre/types.ts";

defineProps<{
    spatialViews: ArchesSpatialView[];
    loadingEntryKey: string | null;
    isBusy: boolean;
}>();

const emit = defineEmits<{
    (event: "add", spatialView: ArchesSpatialView): void;
    (event: "cancel"): void;
}>();
</script>

<template>
    <div class="spatial-view-list">
        <h4>{{ $gettext("Spatial views") }}</h4>
        <ul>
            <CatalogEntry
                v-for="spatialView in spatialViews"
                :key="spatialView.spatialviewid"
                :label="spatialView.slug"
                :is-loading="loadingEntryKey === spatialView.spatialviewid"
                :is-disabled="isBusy"
                @add="emit('add', spatialView)"
                @cancel="emit('cancel')"
            />
        </ul>
    </div>
</template>

<style scoped>
h4 {
    margin: 0 0 0.25rem;
    font-size: 0.875rem;
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
