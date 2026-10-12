<script setup lang="ts">
import { ref, watchEffect } from "vue";

import Button from "openvue/button";

import { useArchesWorkspace } from "@/arches_geolibre/composables/use-arches-workspace.ts";
import {
    useArchesFetch,
    useGeoLibreApp,
} from "@/arches_geolibre/composables/use-geolibre-app.ts";
import { fetchCanEditResource } from "@/arches_geolibre/utils/arches-client.ts";
import { resourceUrl } from "@/arches_geolibre/utils/resource-links.ts";

const props = defineProps<{
    resourceInstanceId: string;
    name: string;
}>();

const workspace = useArchesWorkspace();
const geolibreApp = useGeoLibreApp();
const archesFetch = useArchesFetch();

const canEdit = ref(false);

watchEffect(async () => {
    canEdit.value = false;
    if (!workspace.session) {
        return;
    }
    try {
        canEdit.value = await fetchCanEditResource(
            archesFetch,
            workspace.session,
            props.resourceInstanceId,
        );
    } catch {
        // Without an answer, link to the report, which every reader can open.
        canEdit.value = false;
    }
});

function openInArches(): void {
    if (!workspace.session) {
        return;
    }
    const url = resourceUrl(
        workspace.session,
        props.resourceInstanceId,
        canEdit.value,
    );
    if (geolibreApp.openExternalUrl) {
        geolibreApp.openExternalUrl(url);
    } else {
        window.open(url, "_blank", "noopener");
    }
}
</script>

<template>
    <li class="selected-resource">
        <span class="resource-name">
            {{ name || $gettext("Unnamed resource") }}
        </span>
        <Button
            :label="
                canEdit
                    ? $gettext('Edit in Arches')
                    : $gettext('View in Arches')
            "
            size="small"
            severity="secondary"
            :disabled="!workspace.session"
            @click="openInArches"
        />
    </li>
</template>

<style scoped>
.selected-resource {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.resource-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
}
</style>
