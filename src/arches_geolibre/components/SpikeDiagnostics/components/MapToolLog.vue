<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

import { useGeoLibreApp } from "@/arches_geolibre/composables/use-geolibre-app.ts";

const MAXIMUM_LOG_ENTRIES = 10;

const geolibreApp = useGeoLibreApp();

const logEntries = ref<string[]>([]);

let unsubscribe: (() => void) | undefined;

onMounted(() => {
    appendEntry(`initial: ${geolibreApp.getActiveMapTool?.() ?? "unknown"}`);
    unsubscribe = geolibreApp.onActiveMapToolChange?.((tool) => {
        appendEntry(`changed: ${tool}`);
    });
});

onBeforeUnmount(() => {
    unsubscribe?.();
});

function appendEntry(description: string): void {
    const timestamp = new Date().toLocaleTimeString();
    logEntries.value = [
        `${timestamp} ${description}`,
        ...logEntries.value,
    ].slice(0, MAXIMUM_LOG_ENTRIES);
}
</script>

<template>
    <section>
        <h4>Active map tool</h4>
        <ol>
            <li
                v-for="logEntry in logEntries"
                :key="logEntry"
            >
                {{ logEntry }}
            </li>
        </ol>
    </section>
</template>

<style scoped>
h4 {
    margin: 0 0 0.25rem;
}

ol {
    margin: 0;
    padding-inline-start: 1rem;
}
</style>
