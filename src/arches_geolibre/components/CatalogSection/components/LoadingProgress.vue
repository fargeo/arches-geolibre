<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";

import { useGettext } from "vue3-gettext";

const props = defineProps<{ layerName: string; receivedByteCount: number }>();

const { $gettext } = useGettext();

const startTime = Date.now();
const elapsedSeconds = ref(0);
const timer = setInterval(() => {
    elapsedSeconds.value = Math.round((Date.now() - startTime) / 1000);
}, 1000);

onBeforeUnmount(() => clearInterval(timer));

// Arches builds the whole response before sending any of it, so for large
// nodes most of the wait comes before the first byte.
function describeProgress(): string {
    if (props.receivedByteCount === 0) {
        return $gettext("Arches is preparing %{name}… %{seconds} s", {
            name: props.layerName,
            seconds: String(elapsedSeconds.value),
        });
    }
    return $gettext("Downloading %{name}… %{megabytes} MB", {
        name: props.layerName,
        megabytes: (props.receivedByteCount / 1_000_000).toFixed(1),
    });
}
</script>

<template>
    <p
        class="loading-progress"
        aria-live="polite"
    >
        {{ describeProgress() }}
    </p>
</template>

<style scoped>
.loading-progress {
    margin: 0;
    color: var(--arches-geolibre-text-muted-color);
    font-size: 0.875rem;
}
</style>
