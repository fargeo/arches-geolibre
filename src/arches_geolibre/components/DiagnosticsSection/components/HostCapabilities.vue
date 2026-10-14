<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

import { useGeoLibreApp } from "@/arches_geolibre/composables/use-geolibre-app.ts";

const HOST_MEMBERS_TO_PROBE = [
    "addGeoJsonLayer",
    "getLayerFeatures",
    "listLayers",
    "onSelectionChange",
    "onActiveMapToolChange",
    "registerRightPanel",
    "updateGeoJsonLayer",
    "removeLayer",
    "unregisterExternalNativeLayer",
    "nativeFetch",
    "credentials",
    "getProjectSnapshot",
];

const geolibreApp = useGeoLibreApp();

const isDarkMode = ref(document.documentElement.classList.contains("dark"));
const hostMembers = HOST_MEMBERS_TO_PROBE.map((memberName) => ({
    memberName,
    isAvailable:
        (geolibreApp as unknown as Record<string, unknown>)[memberName] !==
        undefined,
}));
const credentialLocation = geolibreApp.credentials?.location() ?? "none";

let themeObserver: MutationObserver | undefined;

onMounted(() => {
    themeObserver = new MutationObserver(() => {
        isDarkMode.value = document.documentElement.classList.contains("dark");
    });
    themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
    });
});

onBeforeUnmount(() => {
    themeObserver?.disconnect();
});
</script>

<template>
    <section>
        <h4>Host</h4>
        <ul>
            <li
                v-for="hostMember in hostMembers"
                :key="hostMember.memberName"
            >
                {{ hostMember.isAvailable ? "✓" : "✗" }}
                {{ hostMember.memberName }}
            </li>
            <li>Credential store: {{ credentialLocation }}</li>
            <li>Dark mode: {{ isDarkMode }}</li>
        </ul>
    </section>
</template>

<style scoped>
h4 {
    margin: 0 0 0.25rem;
}

ul {
    margin: 0;
    padding-inline-start: 1rem;
}
</style>
