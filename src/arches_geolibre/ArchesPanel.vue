<script setup lang="ts">
import { ref } from "vue";

import ConnectionForm from "@/arches_geolibre/components/ConnectionForm.vue";
import NodeCatalog from "@/arches_geolibre/components/NodeCatalog.vue";
import PendingChanges from "@/arches_geolibre/components/PendingChanges.vue";
import SpikeDiagnostics from "@/arches_geolibre/components/SpikeDiagnostics/SpikeDiagnostics.vue";

import type {
    ArchesSession,
    LoadedArchesLayer,
} from "@/arches_geolibre/types.ts";

const session = ref<ArchesSession | null>(null);
const loadedLayers = ref<LoadedArchesLayer[]>([]);

function addLoadedLayer(loadedLayer: LoadedArchesLayer): void {
    loadedLayers.value = [...loadedLayers.value, loadedLayer];
}

function replaceLoadedLayer(
    previousLayerId: string,
    reloadedLayer: LoadedArchesLayer,
): void {
    loadedLayers.value = loadedLayers.value.map((loadedLayer) =>
        loadedLayer.layerId === previousLayerId ? reloadedLayer : loadedLayer,
    );
}

function signOut(): void {
    session.value = null;
    loadedLayers.value = [];
}
</script>

<template>
    <div class="arches-panel">
        <ConnectionForm
            :session="session"
            @signed-in="session = $event"
            @signed-out="signOut"
        />
        <template v-if="session">
            <NodeCatalog
                :session="session"
                @layer-loaded="addLoadedLayer"
            />
            <PendingChanges
                :session="session"
                :loaded-layers="loadedLayers"
                @layer-reloaded="replaceLoadedLayer"
            />
        </template>
        <SpikeDiagnostics />
    </div>
</template>

<style scoped>
.arches-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 0.75rem;
    font-size: 0.875rem;
}
</style>
