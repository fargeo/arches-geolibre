<script setup lang="ts">
import { ref } from "vue";

import Button from "openvue/button";
import Message from "openvue/message";

import { useEditSessionEnd } from "@/arches_geolibre/composables/use-edit-session-end.ts";
import {
    useArchesFetch,
    useGeoLibreApp,
} from "@/arches_geolibre/composables/use-geolibre-app.ts";
import {
    pushLayerChanges,
    reloadArchesLayer,
} from "@/arches_geolibre/utils/arches-layers.ts";
import { detectFeatureChanges } from "@/arches_geolibre/utils/change-detection.ts";

import type { FeatureChange } from "@/arches_geolibre/utils/change-detection.ts";
import type {
    ArchesSession,
    LoadedArchesLayer,
} from "@/arches_geolibre/types.ts";

const props = defineProps<{
    session: ArchesSession;
    loadedLayers: LoadedArchesLayer[];
}>();

const emit = defineEmits<{
    (
        event: "layer-reloaded",
        previousLayerId: string,
        reloadedLayer: LoadedArchesLayer,
    ): void;
}>();

const geolibreApp = useGeoLibreApp();
const archesFetch = useArchesFetch();

const changesByLayerId = ref(new Map<string, FeatureChange[]>());
const pushingLayerId = ref<string | null>(null);
const statusMessage = ref("");
const errorMessage = ref("");

useEditSessionEnd(
    () => props.loadedLayers.map((loadedLayer) => loadedLayer.layerId),
    (layerId) => {
        const loadedLayer = props.loadedLayers.find(
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
    logSampleChange(loadedLayer, updatedChanges.get(loadedLayer.layerId) ?? []);
}

// Phase 0 diagnostic: shows what a GeoEditor session did to one feature.
function logSampleChange(
    loadedLayer: LoadedArchesLayer,
    changes: FeatureChange[],
): void {
    const sampleChange = changes.find((change) => change.kind === "updated");
    const baselineFeature = loadedLayer.baselineFeatures.find(
        (feature) =>
            feature.properties?.arches_feature_key === sampleChange?.featureKey,
    );
    console.info(
        "[arches-geolibre] change sample",
        JSON.stringify({
            kinds: changes.reduce<Record<string, number>>((counts, change) => {
                counts[change.kind] = (counts[change.kind] ?? 0) + 1;
                return counts;
            }, {}),
            before: baselineFeature,
            after: sampleChange?.feature,
            created: changes.find((change) => change.kind === "created")
                ?.feature,
        }),
    );
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
    pushingLayerId.value = loadedLayer.layerId;
    statusMessage.value = "";
    errorMessage.value = "";
    try {
        const pushResult = await pushLayerChanges(
            geolibreApp,
            archesFetch,
            props.session,
            loadedLayer,
        );
        statusMessage.value =
            `Saved ${pushResult.savedTileCount} tile(s); ` +
            `created ${pushResult.createdResourceIds.length} resource(s).`;
        if (pushResult.provisionalTileCount > 0) {
            statusMessage.value +=
                ` ${pushResult.provisionalTileCount} edit(s) await review ` +
                "in Arches and won't show on the map until approved.";
        }
        if (pushResult.failures.length > 0) {
            errorMessage.value = pushResult.failures.join("\n");
        }

        const reloadedLayer = await reloadArchesLayer(
            geolibreApp,
            archesFetch,
            props.session,
            loadedLayer,
        );
        const updatedChanges = new Map(changesByLayerId.value);
        updatedChanges.delete(loadedLayer.layerId);
        changesByLayerId.value = updatedChanges;
        emit("layer-reloaded", loadedLayer.layerId, reloadedLayer);
    } catch (error) {
        errorMessage.value = String(error);
    } finally {
        pushingLayerId.value = null;
    }
}
</script>

<template>
    <section>
        <h3>Pending changes</h3>
        <p v-if="loadedLayers.length === 0">
            Add a geometry node to the map, edit it with the GeoEditor, then
            save the edit session.
        </p>
        <ul class="layer-list">
            <li
                v-for="loadedLayer in loadedLayers"
                :key="loadedLayer.layerId"
            >
                <div class="layer-heading">
                    <strong>{{ loadedLayer.node.name }}</strong>
                    <Button
                        label="Check"
                        size="small"
                        severity="secondary"
                        @click="checkForChanges(loadedLayer)"
                    />
                    <Button
                        label="Push to Arches"
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
                    {{ countChanges(loadedLayer.layerId, "updated") }} edited,
                    {{ countChanges(loadedLayer.layerId, "created") }} new,
                    {{ countChanges(loadedLayer.layerId, "deleted") }} deleted
                </span>
                <span v-if="!loadedLayer.isWritable">Read only</span>
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
