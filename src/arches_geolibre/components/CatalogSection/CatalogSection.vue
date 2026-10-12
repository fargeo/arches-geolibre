<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";

import { useGettext } from "vue3-gettext";

import Message from "openvue/message";

import ResourceModelGroup from "@/arches_geolibre/components/CatalogSection/components/ResourceModelGroup.vue";
import SpatialViewList from "@/arches_geolibre/components/CatalogSection/components/SpatialViewList.vue";

import { useArchesWorkspace } from "@/arches_geolibre/composables/use-arches-workspace.ts";
import {
    useArchesFetch,
    useGeoLibreApp,
} from "@/arches_geolibre/composables/use-geolibre-app.ts";
import {
    TooManyResourcesError,
    fetchGeometryNodes,
    fetchSpatialViews,
} from "@/arches_geolibre/utils/arches-client.ts";
import { loadArchesLayer } from "@/arches_geolibre/utils/arches-layers.ts";
import { groupNodesByResourceModel } from "@/arches_geolibre/utils/catalog.ts";

import type {
    ArchesGeometryNode,
    ArchesLayerSource,
    ArchesSession,
    ArchesSpatialView,
} from "@/arches_geolibre/types.ts";

const workspace = useArchesWorkspace();
const geolibreApp = useGeoLibreApp();
const archesFetch = useArchesFetch();
const { $gettext } = useGettext();

const readableNodes = ref<ArchesGeometryNode[]>([]);
const writableNodeIds = ref(new Set<string>());
const spatialViews = ref<ArchesSpatialView[]>([]);
const isFetchingCatalog = ref(false);
const loadingEntryKey = ref<string | null>(null);
const errorMessage = ref("");
const infoMessage = ref("");
const progressMessage = ref("");

let loadAbortController: AbortController | null = null;

const resourceModelGroups = computed(() =>
    groupNodesByResourceModel(readableNodes.value),
);
const nodesById = computed(
    () => new Map(readableNodes.value.map((node) => [node.nodeid, node])),
);

watchEffect(async () => {
    if (workspace.session) {
        await fetchCatalog(workspace.session);
    }
});

async function fetchCatalog(session: ArchesSession): Promise<void> {
    isFetchingCatalog.value = true;
    errorMessage.value = "";
    try {
        const [nodesUserCanRead, nodesUserCanWrite, activeSpatialViews] =
            await Promise.all([
                fetchGeometryNodes(archesFetch, session, "read_nodegroup"),
                fetchGeometryNodes(archesFetch, session, "write_nodegroup"),
                fetchSpatialViews(archesFetch, session),
            ]);
        readableNodes.value = nodesUserCanRead;
        writableNodeIds.value = new Set(
            nodesUserCanWrite.map((node) => node.nodeid),
        );
        spatialViews.value = activeSpatialViews.filter((spatialView) =>
            nodesById.value.has(spatialView.geometrynodeid),
        );
    } catch (error) {
        errorMessage.value = $gettext("Could not load the catalog: %{reason}", {
            reason: String(error),
        });
    } finally {
        isFetchingCatalog.value = false;
    }
}

function addNode(node: ArchesGeometryNode): Promise<void> {
    return addToMap(node.nodeid, node, { kind: "node" });
}

function addSpatialView(spatialView: ArchesSpatialView): Promise<void> {
    const node = nodesById.value.get(spatialView.geometrynodeid);
    if (!node) {
        return Promise.resolve();
    }
    return addToMap(spatialView.spatialviewid, node, {
        kind: "spatial-view",
        spatialViewId: spatialView.spatialviewid,
        slug: spatialView.slug,
    });
}

async function addToMap(
    entryKey: string,
    node: ArchesGeometryNode,
    source: ArchesLayerSource,
): Promise<void> {
    if (!workspace.session) {
        return;
    }
    loadAbortController = new AbortController();
    loadingEntryKey.value = entryKey;
    errorMessage.value = "";
    infoMessage.value = "";
    progressMessage.value = "";
    try {
        const loadedLayer = await loadArchesLayer(
            geolibreApp,
            archesFetch,
            workspace.session,
            node,
            {
                source,
                isWritable: writableNodeIds.value.has(node.nodeid),
                bounds: geolibreApp.getViewBounds?.() ?? null,
                signal: loadAbortController.signal,
                onProgress: (loadedResources, totalResources) => {
                    progressMessage.value = $gettext(
                        "Loading %{loaded} of %{total} resources in view…",
                        { loaded: loadedResources, total: totalResources },
                    );
                },
            },
        );
        workspace.loadedLayers.push(loadedLayer);
        if (loadedLayer.baselineFeatures.length === 0) {
            infoMessage.value = $gettext(
                "%{name} has no geometry you're allowed to see in this view.",
                { name: node.name },
            );
        }
    } catch (error) {
        if (error instanceof TooManyResourcesError) {
            infoMessage.value = $gettext(
                "%{total} resources are in view, more than the %{maximum} that can be loaded at once. Zoom in and try again.",
                {
                    total: error.totalResources,
                    maximum: error.maximumResources,
                },
            );
        } else if (!loadAbortController.signal.aborted) {
            errorMessage.value = $gettext("Could not load %{name}: %{reason}", {
                name: node.name,
                reason: String(error),
            });
        }
    } finally {
        loadingEntryKey.value = null;
        loadAbortController = null;
        progressMessage.value = "";
    }
}

function cancelLoading(): void {
    loadAbortController?.abort();
}
</script>

<template>
    <section class="catalog-section">
        <h3>{{ $gettext("Add Arches data") }}</h3>
        <small>
            {{
                $gettext(
                    "Layers load the resources in the current map view. Zoom to the area you want first.",
                )
            }}
        </small>
        <p v-if="isFetchingCatalog">{{ $gettext("Loading the catalog…") }}</p>
        <ResourceModelGroup
            v-for="group in resourceModelGroups"
            :key="group.graphId"
            :resource-model-name="group.resourceModelName"
            :nodes="group.nodes"
            :loading-entry-key="loadingEntryKey"
            :is-busy="loadingEntryKey !== null"
            @add="addNode"
            @cancel="cancelLoading"
        />
        <SpatialViewList
            v-if="spatialViews.length > 0"
            :spatial-views="spatialViews"
            :loading-entry-key="loadingEntryKey"
            :is-busy="loadingEntryKey !== null"
            @add="addSpatialView"
            @cancel="cancelLoading"
        />
        <p v-if="!isFetchingCatalog && resourceModelGroups.length === 0">
            {{
                $gettext("You can't see any geometry in this Arches instance.")
            }}
        </p>
        <small v-if="progressMessage">{{ progressMessage }}</small>
        <Message
            v-if="infoMessage"
            severity="info"
            size="small"
        >
            {{ infoMessage }}
        </Message>
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
.catalog-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

h3 {
    margin: 0;
    font-size: 1rem;
}
</style>
