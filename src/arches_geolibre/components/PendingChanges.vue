<script setup lang="ts">
import { ref } from "vue";

import { useGettext } from "vue3-gettext";

import Button from "openvue/button";
import Message from "openvue/message";

import { useArchesWorkspace } from "@/arches_geolibre/composables/use-arches-workspace.ts";
import { useEditSessionEnd } from "@/arches_geolibre/composables/use-edit-session-end.ts";
import {
    useArchesFetch,
    useGeoLibreApp,
} from "@/arches_geolibre/composables/use-geolibre-app.ts";
import {
    archesLayerName,
    pushLayerChanges,
    reloadArchesLayer,
} from "@/arches_geolibre/utils/arches-layers.ts";
import { detectFeatureChanges } from "@/arches_geolibre/utils/change-detection.ts";

import type { FeatureChange } from "@/arches_geolibre/utils/change-detection.ts";
import type { LoadedArchesLayer } from "@/arches_geolibre/types.ts";

const workspace = useArchesWorkspace();
const geolibreApp = useGeoLibreApp();
const archesFetch = useArchesFetch();
const { $gettext } = useGettext();

const changesByLayerId = ref(new Map<string, FeatureChange[]>());
const pushingLayerId = ref<string | null>(null);
const statusMessage = ref("");
const errorMessage = ref("");

useEditSessionEnd(
    () => workspace.loadedLayers.map((loadedLayer) => loadedLayer.layerId),
    (layerId) => {
        const loadedLayer = workspace.loadedLayers.find(
            (candidate) => candidate.layerId === layerId,
        );
        if (loadedLayer) {
            checkForChanges(loadedLayer);
        }
    },
);

function checkForChanges(loadedLayer: LoadedArchesLayer): void {
    const currentFeatures =
        geolibreApp.getLayerFeatures?.(loadedLayer.layerId) ?? [];
    const updatedChanges = new Map(changesByLayerId.value);
    updatedChanges.set(
        loadedLayer.layerId,
        detectFeatureChanges(loadedLayer.baselineFeatures, currentFeatures),
    );
    changesByLayerId.value = updatedChanges;
}

function countChanges(layerId: string, kind: FeatureChange["kind"]): number {
    return (changesByLayerId.value.get(layerId) ?? []).filter(
        (change) => change.kind === kind,
    ).length;
}

function hasChanges(layerId: string): boolean {
    return (changesByLayerId.value.get(layerId)?.length ?? 0) > 0;
}

async function pushToArches(loadedLayer: LoadedArchesLayer): Promise<void> {
    if (!workspace.session) {
        return;
    }
    pushingLayerId.value = loadedLayer.layerId;
    statusMessage.value = "";
    errorMessage.value = "";
    try {
        const pushResult = await pushLayerChanges(
            geolibreApp,
            archesFetch,
            workspace.session,
            loadedLayer,
        );
        statusMessage.value = $gettext(
            "Saved %{tileCount} tile(s); created %{resourceCount} resource(s).",
            {
                tileCount: pushResult.savedTileCount,
                resourceCount: pushResult.createdResourceIds.length,
            },
        );
        if (pushResult.provisionalTileCount > 0) {
            statusMessage.value +=
                " " +
                $gettext(
                    "%{count} edit(s) await review in Arches and won't show on the map until approved.",
                    { count: pushResult.provisionalTileCount },
                );
        }
        if (pushResult.failures.length > 0) {
            errorMessage.value = pushResult.failures.join("\n");
        }

        const reloadedLayer = await reloadArchesLayer(
            geolibreApp,
            archesFetch,
            workspace.session,
            loadedLayer,
        );
        const updatedChanges = new Map(changesByLayerId.value);
        updatedChanges.delete(loadedLayer.layerId);
        changesByLayerId.value = updatedChanges;
        workspace.loadedLayers = workspace.loadedLayers.map((candidate) =>
            candidate.layerId === loadedLayer.layerId
                ? reloadedLayer
                : candidate,
        );
    } catch (error) {
        errorMessage.value = String(error);
    } finally {
        pushingLayerId.value = null;
    }
}
</script>

<template>
    <section v-if="workspace.loadedLayers.length > 0">
        <h3>{{ $gettext("Pending changes") }}</h3>
        <ul class="layer-list">
            <li
                v-for="loadedLayer in workspace.loadedLayers"
                :key="loadedLayer.layerId"
            >
                <div class="layer-heading">
                    <strong>
                        {{
                            archesLayerName(
                                loadedLayer.node,
                                loadedLayer.source,
                            )
                        }}
                    </strong>
                    <Button
                        :label="$gettext('Check')"
                        size="small"
                        severity="secondary"
                        @click="checkForChanges(loadedLayer)"
                    />
                    <Button
                        :label="$gettext('Push to Arches')"
                        size="small"
                        :disabled="
                            !loadedLayer.isWritable ||
                            !hasChanges(loadedLayer.layerId)
                        "
                        :loading="pushingLayerId === loadedLayer.layerId"
                        @click="pushToArches(loadedLayer)"
                    />
                </div>
                <span v-if="changesByLayerId.has(loadedLayer.layerId)">
                    {{
                        $gettext(
                            "%{edited} edited, %{created} new, %{deleted} deleted",
                            {
                                edited: countChanges(
                                    loadedLayer.layerId,
                                    "updated",
                                ),
                                created: countChanges(
                                    loadedLayer.layerId,
                                    "created",
                                ),
                                deleted: countChanges(
                                    loadedLayer.layerId,
                                    "deleted",
                                ),
                            },
                        )
                    }}
                </span>
                <span v-if="!loadedLayer.isWritable">
                    {{ $gettext("Read only") }}
                </span>
            </li>
        </ul>
        <Message
            v-if="statusMessage"
            severity="success"
            size="small"
        >
            {{ statusMessage }}
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
h3 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
}

.layer-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
}

.layer-heading {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.layer-heading strong {
    flex: 1;
}
</style>
