<script setup lang="ts">
import AwaitingReviewSection from "@/arches_geolibre/components/AwaitingReviewSection.vue";
import CatalogSection from "@/arches_geolibre/components/CatalogSection/CatalogSection.vue";
import ConnectionSection from "@/arches_geolibre/components/ConnectionSection/ConnectionSection.vue";
import DiagnosticsSection from "@/arches_geolibre/components/DiagnosticsSection/DiagnosticsSection.vue";
import EditResourcesSection from "@/arches_geolibre/components/EditResourcesSection/EditResourcesSection.vue";
import PendingChanges from "@/arches_geolibre/components/PendingChanges/PendingChanges.vue";
import ProjectLayersSection from "@/arches_geolibre/components/ProjectLayersSection.vue";
import SelectionSection from "@/arches_geolibre/components/SelectionSection/SelectionSection.vue";

import { useArchesWorkspace } from "@/arches_geolibre/composables/use-arches-workspace.ts";

const SHOW_DIAGNOSTICS =
    import.meta.env.VITE_ARCHES_GEOLIBRE_DIAGNOSTICS === "true";

const workspace = useArchesWorkspace();
</script>

<template>
    <div class="arches-panel">
        <ConnectionSection />
        <ProjectLayersSection v-if="workspace.savedLayers.length > 0" />
        <template v-if="workspace.session">
            <AwaitingReviewSection />
            <SelectionSection />
            <CatalogSection />
            <EditResourcesSection />
            <PendingChanges />
        </template>
        <DiagnosticsSection v-if="SHOW_DIAGNOSTICS" />
    </div>
</template>

<style scoped>
.arches-panel {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    padding: 0.75rem;
    font-size: 0.875rem;
}
</style>
