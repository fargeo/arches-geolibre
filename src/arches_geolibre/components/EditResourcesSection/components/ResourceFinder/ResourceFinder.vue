<script setup lang="ts">
import { ref } from "vue";

import { useGettext } from "vue3-gettext";

import Message from "openvue/message";
import SelectButton from "openvue/selectbutton";

import MapSelectionPicker from "@/arches_geolibre/components/EditResourcesSection/components/ResourceFinder/components/MapSelectionPicker.vue";
import MissingGeometryList from "@/arches_geolibre/components/EditResourcesSection/components/ResourceFinder/components/MissingGeometryList.vue";
import ResourceSearch from "@/arches_geolibre/components/EditResourcesSection/components/ResourceFinder/components/ResourceSearch.vue";

import { useDescribeRequestError } from "@/arches_geolibre/composables/use-describe-request-error.ts";
import {
    LayerBeingEditedError,
    useWorklist,
} from "@/arches_geolibre/composables/use-worklist.ts";

import type { ArchesGeometryNode } from "@/arches_geolibre/types.ts";

defineProps<{ node: ArchesGeometryNode }>();

const { addResources } = useWorklist();
const { $gettext } = useGettext();
const describeRequestError = useDescribeRequestError();

type FinderTab = "missing" | "search" | "map";

const tabOptions = [
    { value: "missing", label: $gettext("Missing geometry") },
    { value: "search", label: $gettext("Search") },
    { value: "map", label: $gettext("From the map") },
];
const activeTab = ref<FinderTab>("missing");
const isAdding = ref(false);
const errorMessage = ref("");

async function add(
    resources: { resourceInstanceId: string; name: string }[],
): Promise<void> {
    isAdding.value = true;
    errorMessage.value = "";
    try {
        await addResources(resources);
    } catch (error) {
        errorMessage.value =
            error instanceof LayerBeingEditedError
                ? $gettext(
                      "Save or cancel the edit session on the worklist layer first.",
                  )
                : describeRequestError(error);
    } finally {
        isAdding.value = false;
    }
}
</script>

<template>
    <div class="resource-finder">
        <SelectButton
            v-model="activeTab"
            :options="tabOptions"
            option-label="label"
            option-value="value"
            :allow-empty="false"
            :aria-label="$gettext('Find resources')"
            size="small"
        />
        <MissingGeometryList
            v-if="activeTab === 'missing'"
            :node="node"
            :is-adding="isAdding"
            @add="add"
        />
        <ResourceSearch
            v-else-if="activeTab === 'search'"
            :node="node"
            :is-adding="isAdding"
            @add="add"
        />
        <MapSelectionPicker
            v-else
            :node="node"
            :is-adding="isAdding"
            @add="add"
        />
        <Message
            v-if="errorMessage"
            severity="error"
            size="small"
        >
            {{ errorMessage }}
        </Message>
    </div>
</template>

<style scoped>
.resource-finder {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}
</style>
