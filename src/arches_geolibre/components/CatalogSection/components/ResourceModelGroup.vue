<script setup lang="ts">
import CatalogEntry from "@/arches_geolibre/components/CatalogSection/components/CatalogEntry.vue";

import type { ArchesGeometryNode } from "@/arches_geolibre/types.ts";

defineProps<{
    resourceModelName: string;
    nodes: ArchesGeometryNode[];
    loadingEntryKey: string | null;
    isBusy: boolean;
}>();

const emit = defineEmits<{
    (event: "add", node: ArchesGeometryNode): void;
    (event: "cancel"): void;
}>();
</script>

<template>
    <div class="resource-model-group">
        <h4>{{ resourceModelName }}</h4>
        <ul>
            <CatalogEntry
                v-for="node in nodes"
                :key="node.nodeid"
                :label="node.name"
                :is-loading="loadingEntryKey === node.nodeid"
                :is-disabled="isBusy"
                @add="emit('add', node)"
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
