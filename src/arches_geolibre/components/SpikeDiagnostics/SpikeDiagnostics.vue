<script setup lang="ts">
import HostCapabilities from "@/arches_geolibre/components/SpikeDiagnostics/components/HostCapabilities.vue";
import MapToolLog from "@/arches_geolibre/components/SpikeDiagnostics/components/MapToolLog.vue";
import SelectionInspector from "@/arches_geolibre/components/SpikeDiagnostics/components/SelectionInspector.vue";
</script>

<template>
    <details class="spike-diagnostics">
        <summary>Phase 0 diagnostics</summary>
        <HostCapabilities />
        <MapToolLog />
        <SelectionInspector />
    </details>
</template>

<style scoped>
.spike-diagnostics {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

summary {
    cursor: pointer;
    font-weight: 600;
}
</style>
