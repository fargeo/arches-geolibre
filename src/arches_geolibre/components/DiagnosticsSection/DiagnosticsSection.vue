<script setup lang="ts">
import HostCapabilities from "@/arches_geolibre/components/DiagnosticsSection/components/HostCapabilities.vue";
import MapToolLog from "@/arches_geolibre/components/DiagnosticsSection/components/MapToolLog.vue";
import SelectionInspector from "@/arches_geolibre/components/DiagnosticsSection/components/SelectionInspector.vue";
</script>

<template>
    <details class="diagnostics-section">
        <summary>Diagnostics</summary>
        <HostCapabilities />
        <MapToolLog />
        <SelectionInspector />
    </details>
</template>

<style scoped>
.diagnostics-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

summary {
    cursor: pointer;
    font-weight: 600;
}
</style>
