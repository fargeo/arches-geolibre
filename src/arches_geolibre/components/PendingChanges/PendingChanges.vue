<script setup lang="ts">
import LayerChanges from "@/arches_geolibre/components/PendingChanges/components/LayerChanges/LayerChanges.vue";

import { useArchesWorkspace } from "@/arches_geolibre/composables/use-arches-workspace.ts";

const workspace = useArchesWorkspace();
</script>

<template>
    <section
        v-if="workspace.loadedLayers.length > 0"
        class="pending-changes"
    >
        <h3>{{ $gettext("Pending changes") }}</h3>
        <small>
            {{
                $gettext(
                    "Edit a layer with ⋯ → Edit geometry, then save the edit session. Zoom in before drawing: the editor can't draw on the zoomed-out globe.",
                )
            }}
        </small>
        <LayerChanges
            v-for="loadedLayer in workspace.loadedLayers"
            :key="loadedLayer.layerId"
            :layer-id="loadedLayer.layerId"
        />
    </section>
</template>

<style scoped>
.pending-changes {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

h3 {
    margin: 0;
    font-size: 1rem;
}
</style>
