<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";

import Button from "openvue/button";
import Message from "openvue/message";
import Tag from "openvue/tag";

import {
    useArchesFetch,
    useGeoLibreApp,
} from "@/arches_geolibre/composables/use-geolibre-app.ts";
import { fetchGeometryNodes } from "@/arches_geolibre/utils/arches-client.ts";
import { loadArchesLayer } from "@/arches_geolibre/utils/arches-layers.ts";

import type {
    ArchesGeometryNode,
    ArchesSession,
    LoadedArchesLayer,
} from "@/arches_geolibre/types.ts";

const props = defineProps<{ session: ArchesSession }>();

const emit = defineEmits<{
    (event: "layer-loaded", loadedLayer: LoadedArchesLayer): void;
}>();

const geolibreApp = useGeoLibreApp();
const archesFetch = useArchesFetch();

const readableNodes = ref<ArchesGeometryNode[]>([]);
const writableNodeIds = ref(new Set<string>());
const loadingNodeId = ref<string | null>(null);
const errorMessage = ref("");

const sortedNodes = computed(() =>
    [...readableNodes.value].sort((firstNode, secondNode) =>
        `${firstNode.resourcemodelname} ${firstNode.name}`.localeCompare(
            `${secondNode.resourcemodelname} ${secondNode.name}`,
        ),
    ),
);

watchEffect(async () => {
    await fetchCatalog(props.session);
});

async function fetchCatalog(session: ArchesSession): Promise<void> {
    errorMessage.value = "";
    try {
        const [nodesUserCanRead, nodesUserCanWrite] = await Promise.all([
            fetchGeometryNodes(archesFetch, session, "read_nodegroup"),
            fetchGeometryNodes(archesFetch, session, "write_nodegroup"),
        ]);
        readableNodes.value = nodesUserCanRead;
        writableNodeIds.value = new Set(
            nodesUserCanWrite.map((node) => node.nodeid),
        );
    } catch (error) {
        errorMessage.value = String(error);
    }
}

async function addToMap(node: ArchesGeometryNode): Promise<void> {
    loadingNodeId.value = node.nodeid;
    errorMessage.value = "";
    try {
        emit(
            "layer-loaded",
            await loadArchesLayer(
                geolibreApp,
                archesFetch,
                props.session,
                node,
                writableNodeIds.value.has(node.nodeid),
            ),
        );
    } catch (error) {
        errorMessage.value = String(error);
    } finally {
        loadingNodeId.value = null;
    }
}
</script>

<template>
    <section>
        <h3>Geometry nodes</h3>
        <ul class="node-list">
            <li
                v-for="node in sortedNodes"
                :key="node.nodeid"
            >
                <span class="node-name">
                    <strong>{{ node.resourcemodelname }}</strong>
                    {{ node.name }}
                </span>
                <Tag
                    v-if="writableNodeIds.has(node.nodeid)"
                    value="editable"
                    severity="success"
                />
                <Button
                    label="Add"
                    size="small"
                    :loading="loadingNodeId === node.nodeid"
                    @click="addToMap(node)"
                />
            </li>
        </ul>
        <Message
            v-if="errorMessage"
            severity="error"
            size="small"
        >
            {{ errorMessage }}
        </Message>
    </section>
</template>

<style scoped>
h3 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
}

.node-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
}

.node-list li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.node-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
}
</style>
