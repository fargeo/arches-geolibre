<script setup lang="ts">
import { computed, ref } from "vue";

import { useGettext } from "vue3-gettext";

import Button from "openvue/button";
import Message from "openvue/message";

import { useArchesWorkspace } from "@/arches_geolibre/composables/use-arches-workspace.ts";
import { useDescribeRequestError } from "@/arches_geolibre/composables/use-describe-request-error.ts";
import {
    useArchesFetch,
    useGeoLibreApp,
} from "@/arches_geolibre/composables/use-geolibre-app.ts";
import {
    archesLayerName,
    reloadArchesLayer,
} from "@/arches_geolibre/utils/arches-layers.ts";

import type { SavedArchesLayer } from "@/arches_geolibre/workspace.ts";

const workspace = useArchesWorkspace();
const geolibreApp = useGeoLibreApp();
const archesFetch = useArchesFetch();
const { $gettext } = useGettext();
const describeRequestError = useDescribeRequestError();

const isReloading = ref(false);
const errorMessage = ref("");

const isSignedInToProjectInstance = computed(
    () => workspace.session?.instanceUrl === workspace.projectInstanceUrl,
);

async function reloadAll(): Promise<void> {
    isReloading.value = true;
    errorMessage.value = "";
    for (const savedLayer of [...workspace.savedLayers]) {
        await reload(savedLayer);
    }
    isReloading.value = false;
}

async function reload(savedLayer: SavedArchesLayer): Promise<void> {
    if (!workspace.session) {
        return;
    }
    try {
        workspace.loadedLayers.push(
            await reloadArchesLayer(
                geolibreApp,
                archesFetch,
                workspace.session,
                savedLayer,
            ),
        );
        workspace.savedLayers = workspace.savedLayers.filter(
            (candidate) => candidate.layerId !== savedLayer.layerId,
        );
    } catch (error) {
        errorMessage.value = $gettext("Could not reload %{name}. %{reason}", {
            name: archesLayerName(savedLayer.node, savedLayer.source),
            reason: describeRequestError(error),
        });
    }
}
</script>

<template>
    <section class="project-layers-section">
        <h3>{{ $gettext("Arches layers in this project") }}</h3>
        <template v-if="isSignedInToProjectInstance">
            <p>
                {{
                    $gettext(
                        "These layers show the data saved with the project. Reload them to see Arches' current data.",
                    )
                }}
            </p>
            <ul>
                <li
                    v-for="savedLayer in workspace.savedLayers"
                    :key="savedLayer.layerId"
                >
                    {{ archesLayerName(savedLayer.node, savedLayer.source) }}
                </li>
            </ul>
            <Button
                :label="$gettext('Reload from Arches')"
                size="small"
                :loading="isReloading"
                @click="reloadAll"
            />
        </template>
        <p v-else>
            {{
                $gettext(
                    "This project's Arches layers come from %{instanceUrl}. Sign in there to reload them.",
                    { instanceUrl: workspace.projectInstanceUrl ?? "" },
                )
            }}
        </p>
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
.project-layers-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

h3 {
    margin: 0;
    font-size: 1rem;
}

p,
ul {
    margin: 0;
}
</style>
