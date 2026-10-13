<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import { useGettext } from "vue3-gettext";

import Button from "openvue/button";
import Select from "openvue/select";

import { useArchesWorkspace } from "@/arches_geolibre/composables/use-arches-workspace.ts";
import { useArchesFetch } from "@/arches_geolibre/composables/use-geolibre-app.ts";
import { fetchGeometryNodes } from "@/arches_geolibre/utils/arches-client.ts";

import type { ArchesGeometryNode } from "@/arches_geolibre/types.ts";

defineProps<{ isStarting: boolean }>();

const emit = defineEmits<{
    (event: "start", node: ArchesGeometryNode): void;
}>();

const workspace = useArchesWorkspace();
const archesFetch = useArchesFetch();
const { $gettext } = useGettext();

const writableNodes = ref<ArchesGeometryNode[]>([]);
const selectedNodeId = ref<string | null>(null);

const nodeOptions = computed(() =>
    writableNodes.value.map((node) => ({
        label: `${node.resourcemodelname}: ${node.name}`,
        value: node.nodeid,
    })),
);
const selectedNode = computed(() =>
    writableNodes.value.find((node) => node.nodeid === selectedNodeId.value),
);

onMounted(async () => {
    if (!workspace.session) {
        return;
    }
    try {
        writableNodes.value = await fetchGeometryNodes(
            archesFetch,
            workspace.session,
            "write_nodegroup",
        );
    } catch {
        writableNodes.value = [];
    }
    if (writableNodes.value.length === 1) {
        selectedNodeId.value = writableNodes.value[0].nodeid;
    }
});
</script>

<template>
    <div class="node-picker">
        <Select
            v-model="selectedNodeId"
            :options="nodeOptions"
            option-label="label"
            option-value="value"
            :placeholder="$gettext('Choose a model and geometry')"
            :aria-label="$gettext('Model and geometry to edit')"
            fluid
        />
        <Button
            :label="$gettext('Start a worklist')"
            size="small"
            :disabled="!selectedNode"
            :loading="isStarting"
            @click="selectedNode && emit('start', selectedNode)"
        />
        <small v-if="writableNodes.length === 0">
            {{
                $gettext(
                    "You can't edit geometry in any resource model on this instance.",
                )
            }}
        </small>
    </div>
</template>

<style scoped>
.node-picker {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}
</style>
