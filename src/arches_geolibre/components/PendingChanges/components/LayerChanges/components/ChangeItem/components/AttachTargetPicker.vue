<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

import { useGettext } from "vue3-gettext";

import AutoComplete from "openvue/autocomplete";
import Button from "openvue/button";
import SelectButton from "openvue/selectbutton";

import { useArchesWorkspace } from "@/arches_geolibre/composables/use-arches-workspace.ts";
import {
    useArchesFetch,
    useGeoLibreApp,
} from "@/arches_geolibre/composables/use-geolibre-app.ts";
import { searchResources } from "@/arches_geolibre/utils/arches-client.ts";

import type { AutoCompleteCompleteEvent } from "openvue/autocomplete";
import type { GeoLibreSelection } from "@/arches_geolibre/geolibre/host-api.ts";
import type { ResourceSearchResult } from "@/arches_geolibre/utils/arches-client.ts";
import type { ChangeTarget } from "@/arches_geolibre/utils/push-plan.ts";

const SEARCH_DELAY_MILLISECONDS = 300;

const props = defineProps<{
    target: ChangeTarget;
    graphId: string;
}>();

const emit = defineEmits<{
    (event: "update:target", target: ChangeTarget): void;
}>();

const workspace = useArchesWorkspace();
const geolibreApp = useGeoLibreApp();
const archesFetch = useArchesFetch();
const { $gettext } = useGettext();

const targetKindOptions = [
    { value: "new-resource", label: $gettext("New resource") },
    { value: "existing-resource", label: $gettext("Existing resource") },
];
const targetKind = ref<ChangeTarget["kind"]>(props.target.kind);
const searchText = ref("");
const searchResults = ref<ResourceSearchResult[]>([]);
const selectedOnMap = ref<ResourceSearchResult | null>(null);
const selectionMessage = ref("");

let searchAbortController: AbortController | null = null;
let stopWatchingSelection: (() => void) | undefined;

onMounted(() => {
    readSelection({
        layerId: geolibreApp.getSelectedLayerId?.() ?? null,
        features: geolibreApp.getSelectedFeatures?.() ?? [],
    });
    stopWatchingSelection = geolibreApp.onSelectionChange?.(readSelection);
});

onBeforeUnmount(() => {
    stopWatchingSelection?.();
    searchAbortController?.abort();
});

function chooseTargetKind(kind: ChangeTarget["kind"]): void {
    targetKind.value = kind;
    if (kind === "new-resource") {
        emit("update:target", { kind: "new-resource" });
    }
}

async function search(event: AutoCompleteCompleteEvent): Promise<void> {
    const session = workspace.session;
    if (!session) {
        return;
    }
    searchAbortController?.abort();
    searchAbortController = new AbortController();
    try {
        searchResults.value = await searchResources(
            archesFetch,
            session,
            props.graphId,
            event.query,
            searchAbortController.signal,
        );
    } catch {
        searchResults.value = [];
    }
}

function attachTo(resource: ResourceSearchResult): void {
    emit("update:target", {
        kind: "existing-resource",
        resourceInstanceId: resource.resourceInstanceId,
        name: resource.name,
    });
}

function readSelection(selection: GeoLibreSelection): void {
    selectedOnMap.value = null;
    selectionMessage.value = "";
    const [selectedFeature] = selection.features;
    const resourceInstanceId = selectedFeature?.properties?.resourceinstanceid;
    if (typeof resourceInstanceId !== "string") {
        return;
    }
    const selectedLayer = workspace.loadedLayers.find(
        (loadedLayer) => loadedLayer.layerId === selection.layerId,
    );
    if (selectedLayer?.node.graph_id !== props.graphId) {
        selectionMessage.value = $gettext(
            "The selected feature belongs to a different resource model.",
        );
        return;
    }
    selectedOnMap.value = {
        resourceInstanceId,
        name: String(selectedFeature.properties?.primary_name ?? ""),
    };
}
</script>

<template>
    <div class="attach-target-picker">
        <SelectButton
            :model-value="targetKind"
            :options="targetKindOptions"
            option-label="label"
            option-value="value"
            :allow-empty="false"
            size="small"
            @update:model-value="chooseTargetKind"
        />
        <template v-if="targetKind === 'existing-resource'">
            <span v-if="target.kind === 'existing-resource'">
                {{ $gettext("Attach to %{name}", { name: target.name }) }}
            </span>
            <AutoComplete
                v-model="searchText"
                :suggestions="searchResults"
                option-label="name"
                :delay="SEARCH_DELAY_MILLISECONDS"
                :placeholder="$gettext('Search by name')"
                :aria-label="$gettext('Search for a resource by name')"
                fluid
                @complete="search"
                @item-select="attachTo($event.value)"
            />
            <Button
                v-if="selectedOnMap"
                :label="
                    $gettext('Use the selected feature: %{name}', {
                        name:
                            selectedOnMap.name || $gettext('Unnamed resource'),
                    })
                "
                size="small"
                severity="secondary"
                @click="attachTo(selectedOnMap)"
            />
            <small v-else-if="selectionMessage">{{ selectionMessage }}</small>
            <small v-else>
                {{
                    $gettext(
                        "Or select one of the resource's features on the map.",
                    )
                }}
            </small>
        </template>
    </div>
</template>

<style scoped>
.attach-target-picker {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding-inline-start: 1.75rem;
}
</style>
