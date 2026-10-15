<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { useGettext } from "vue3-gettext";

import Button from "openvue/button";
import Message from "openvue/message";

import { useArchesWorkspace } from "@/arches_geolibre/composables/use-arches-workspace.ts";
import { useGeoLibreSelection } from "@/arches_geolibre/composables/use-geolibre-selection.ts";
import {
    LayerBeingEditedError,
    useWorklist,
} from "@/arches_geolibre/composables/use-worklist.ts";
import { archesLayerName } from "@/arches_geolibre/utils/arches-layers.ts";
import { moveToNext, skipCurrent } from "@/arches_geolibre/utils/worklist.ts";

const workspace = useArchesWorkspace();
const selection = useGeoLibreSelection();
const {
    worklist,
    worklistLayer,
    current,
    resourceIdsWithPendingChanges,
    copyFeatures,
    zoomToCurrent,
    canEditInPlace,
    editCurrentGeometry,
} = useWorklist();
const { $gettext, $ngettext } = useGettext();

const copyMessage = ref("");
const copyMessageSeverity = ref<"success" | "warn">("success");
const isOpeningEditor = ref(false);
const editorMessage = ref("");

const layerName = computed(() =>
    worklistLayer.value
        ? archesLayerName(worklistLayer.value.node, worklistLayer.value.source)
        : "",
);
const hasPendingChange = computed(
    () =>
        current.value !== null &&
        resourceIdsWithPendingChanges.value.has(
            current.value.resourceInstanceId,
        ),
);
/** Features selected in a layer that isn't an Arches layer, to copy from. */
const copyableSelection = computed(() =>
    workspace.loadedLayers.some(
        (loadedLayer) => loadedLayer.layerId === selection.value.layerId,
    )
        ? []
        : selection.value.features.filter((feature) => feature.geometry),
);

watch(
    () => current.value?.resourceInstanceId,
    () => {
        copyMessage.value = "";
        editorMessage.value = "";
    },
);

async function openEditor(): Promise<void> {
    isOpeningEditor.value = true;
    editorMessage.value = "";
    try {
        if (!(await editCurrentGeometry())) {
            editorMessage.value = $gettext(
                "GeoLibre couldn't open the editor. Open ⋯ → Edit geometry on “%{layer}” instead.",
                { layer: layerName.value },
            );
        }
    } finally {
        isOpeningEditor.value = false;
    }
}

function useSelectedFeatures(): void {
    if (!current.value) {
        return;
    }
    try {
        const { copiedCount, skippedCount } = copyFeatures(
            copyableSelection.value,
        );
        copyMessageSeverity.value = skippedCount > 0 ? "warn" : "success";
        copyMessage.value = [
            $ngettext(
                "Copied 1 feature as %{name}'s geometry.",
                "Copied %{count} features as %{name}'s geometry.",
                copiedCount,
                { count: copiedCount, name: current.value.name },
            ),
            skippedCount > 0
                ? $gettext(
                      "%{count} had no geometry Arches can store and were skipped.",
                      { count: skippedCount },
                  )
                : "",
        ]
            .filter(Boolean)
            .join(" ");
    } catch (error) {
        copyMessageSeverity.value = "warn";
        copyMessage.value =
            error instanceof LayerBeingEditedError
                ? $gettext(
                      "Save or cancel the edit session on the worklist layer first.",
                  )
                : String(error);
    }
}

function goToNext(): void {
    if (workspace.worklist) {
        workspace.worklist = moveToNext(workspace.worklist);
    }
}

function skip(): void {
    if (workspace.worklist) {
        workspace.worklist = skipCurrent(workspace.worklist);
    }
}
</script>

<template>
    <div
        v-if="worklist && current"
        class="current-resource"
    >
        <strong>{{ current.name || $gettext("Unnamed resource") }}</strong>
        <Message
            v-if="current.canEdit === false"
            severity="warn"
            size="small"
        >
            {{ $gettext("You can't edit this resource.") }}
        </Message>
        <small v-else-if="hasPendingChange">
            {{
                $gettext(
                    "New geometry is ready. Push it from Pending changes below, or go on to the next resource.",
                )
            }}
        </small>
        <small v-else-if="canEditInPlace && current.hasGeometry">
            {{
                $gettext("Edit its %{node}, then save the edit session.", {
                    node: worklist.node.name,
                })
            }}
        </small>
        <small v-else-if="canEditInPlace">
            {{
                $gettext(
                    "It has no %{node} yet. Draw it, then save the edit session: whatever you draw goes to this resource. Or select features in another layer and use them.",
                    { node: worklist.node.name },
                )
            }}
        </small>
        <small v-else-if="current.hasGeometry">
            {{
                $gettext(
                    "To edit its %{node}, open ⋯ → Edit geometry on “%{layer}”, change it, then save the edit session.",
                    { node: worklist.node.name, layer: layerName },
                )
            }}
        </small>
        <small v-else>
            {{
                $gettext(
                    "It has no %{node} yet. Open ⋯ → Edit geometry on “%{layer}” and draw it, then save the edit session. Whatever you draw goes to this resource. Or select features in another layer and use them.",
                    { node: worklist.node.name, layer: layerName },
                )
            }}
        </small>
        <div class="current-actions">
            <Button
                v-if="canEditInPlace && current.canEdit !== false"
                :label="
                    current.hasGeometry
                        ? $gettext('Edit geometry')
                        : $gettext('Draw geometry')
                "
                :loading="isOpeningEditor"
                size="small"
                severity="secondary"
                @click="openEditor"
            />
            <Button
                v-if="current.hasGeometry"
                :label="$gettext('Zoom to')"
                size="small"
                severity="secondary"
                @click="zoomToCurrent"
            />
            <Button
                v-if="copyableSelection.length > 0 && current.canEdit !== false"
                :label="
                    $ngettext(
                        'Use the selected feature',
                        'Use the %{count} selected features',
                        copyableSelection.length,
                        { count: copyableSelection.length },
                    )
                "
                size="small"
                severity="secondary"
                @click="useSelectedFeatures"
            />
            <Button
                :label="$gettext('Skip')"
                size="small"
                severity="secondary"
                text
                @click="skip"
            />
            <Button
                :label="$gettext('Next')"
                size="small"
                @click="goToNext"
            />
        </div>
        <Message
            v-if="copyMessage"
            :severity="copyMessageSeverity"
            size="small"
        >
            {{ copyMessage }}
        </Message>
        <Message
            v-if="editorMessage"
            severity="warn"
            size="small"
        >
            {{ editorMessage }}
        </Message>
    </div>
</template>

<style scoped>
.current-resource {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.5rem;
    border: 0.0625rem solid var(--arches-geolibre-content-border-color);
    border-radius: 0.375rem;
}

.current-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
}
</style>
