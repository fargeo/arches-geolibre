<script setup lang="ts">
import { computed } from "vue";

import Button from "openvue/button";

import { useArchesWorkspace } from "@/arches_geolibre/composables/use-arches-workspace.ts";
import { useGeoLibreSelection } from "@/arches_geolibre/composables/use-geolibre-selection.ts";

import type { ResourceResult } from "@/arches_geolibre/components/EditResourcesSection/components/ResourceFinder/types.ts";
import type { ArchesGeometryNode } from "@/arches_geolibre/types.ts";

const props = defineProps<{ node: ArchesGeometryNode; isAdding: boolean }>();

const emit = defineEmits<{
    (event: "add", resources: ResourceResult[]): void;
}>();

const workspace = useArchesWorkspace();
const selection = useGeoLibreSelection();

/** Resources of the worklist's model behind the features selected on the map. */
const selectedResources = computed<ResourceResult[]>(() => {
    const selectedLayer = workspace.loadedLayers.find(
        (loadedLayer) => loadedLayer.layerId === selection.value.layerId,
    );
    if (selectedLayer?.node.graph_id !== props.node.graph_id) {
        return [];
    }
    const namesByResourceId = new Map<string, string>();
    for (const feature of selection.value.features) {
        const resourceInstanceId = feature.properties?.resourceinstanceid;
        if (typeof resourceInstanceId === "string") {
            namesByResourceId.set(
                resourceInstanceId,
                String(feature.properties?.primary_name ?? ""),
            );
        }
    }
    return [...namesByResourceId].map(([resourceInstanceId, name]) => ({
        resourceInstanceId,
        name,
        hasGeometry: null,
    }));
});
</script>

<template>
    <div class="map-selection-picker">
        <template v-if="selectedResources.length > 0">
            <small>
                {{
                    $ngettext(
                        "%{count} %{model} resource selected on the map.",
                        "%{count} %{model} resources selected on the map.",
                        selectedResources.length,
                        {
                            count: selectedResources.length,
                            model: node.resourcemodelname,
                        },
                    )
                }}
            </small>
            <Button
                :label="$gettext('Add selected to the worklist')"
                size="small"
                severity="secondary"
                :loading="isAdding"
                @click="emit('add', selectedResources)"
            />
        </template>
        <small v-else>
            {{
                $gettext(
                    "Select features of %{model} resources in an Arches layer to add those resources.",
                    { model: node.resourcemodelname },
                )
            }}
        </small>
    </div>
</template>

<style scoped>
.map-selection-picker {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}
</style>
