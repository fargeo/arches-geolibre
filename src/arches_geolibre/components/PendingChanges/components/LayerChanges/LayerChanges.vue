<script setup lang="ts">
import { computed, ref } from "vue";

import { useGettext } from "vue3-gettext";

import Button from "openvue/button";
import Message from "openvue/message";

import ChangeItem from "@/arches_geolibre/components/PendingChanges/components/LayerChanges/components/ChangeItem/ChangeItem.vue";

import { useArchesWorkspace } from "@/arches_geolibre/composables/use-arches-workspace.ts";
import { useEditSessionEnd } from "@/arches_geolibre/composables/use-edit-session-end.ts";
import {
    useArchesFetch,
    useGeoLibreApp,
} from "@/arches_geolibre/composables/use-geolibre-app.ts";
import { fetchCanEditResource } from "@/arches_geolibre/utils/arches-client.ts";
import {
    archesLayerName,
    pushLayerChanges,
    reloadArchesLayer,
} from "@/arches_geolibre/utils/arches-layers.ts";
import { detectFeatureChanges } from "@/arches_geolibre/utils/change-detection.ts";
import {
    mergeTrackedReviewTiles,
    saveTrackedReviewTiles,
} from "@/arches_geolibre/utils/pending-review.ts";
import {
    affectedResourceId,
    reconcilePendingChanges,
} from "@/arches_geolibre/utils/push-plan.ts";

import type { LoadedArchesLayer } from "@/arches_geolibre/types.ts";
import type { PushResult } from "@/arches_geolibre/utils/arches-layers.ts";
import type {
    ChangeTarget,
    PendingChange,
} from "@/arches_geolibre/utils/push-plan.ts";

const props = defineProps<{ layerId: string }>();

const workspace = useArchesWorkspace();
const geolibreApp = useGeoLibreApp();
const archesFetch = useArchesFetch();
const { $gettext } = useGettext();

const pendingChanges = ref<PendingChange[]>([]);
const editableResourceIds = ref(new Map<string, boolean>());
const hasChecked = ref(false);
const isChecking = ref(false);
const isPushing = ref(false);
const statusMessage = ref("");
const errorMessage = ref("");

const loadedLayer = computed(() =>
    workspace.loadedLayers.find(
        (candidate) => candidate.layerId === props.layerId,
    ),
);
const includedCount = computed(
    () =>
        pendingChanges.value.filter((pendingChange) => pendingChange.isIncluded)
            .length,
);

useEditSessionEnd(
    () => [props.layerId],
    async () => {
        await checkForChanges();
    },
);

async function checkForChanges(): Promise<void> {
    if (!loadedLayer.value || !workspace.session) {
        return;
    }
    isChecking.value = true;
    try {
        const changes = detectFeatureChanges(
            loadedLayer.value.baselineFeatures,
            geolibreApp.getLayerFeatures?.(props.layerId) ?? [],
        );
        const candidates = reconcilePendingChanges(
            pendingChanges.value,
            changes,
        );
        await learnEditPermissions(candidates);
        pendingChanges.value = reconcilePendingChanges(
            pendingChanges.value,
            changes,
            isBlocked,
        );
        hasChecked.value = true;
    } finally {
        isChecking.value = false;
    }
}

async function learnEditPermissions(
    candidates: PendingChange[],
): Promise<void> {
    const session = workspace.session;
    if (!session) {
        return;
    }
    const unknownResourceIds = [
        ...new Set(
            candidates
                .map(affectedResourceId)
                .filter(
                    (resourceInstanceId): resourceInstanceId is string =>
                        resourceInstanceId !== null &&
                        !editableResourceIds.value.has(resourceInstanceId),
                ),
        ),
    ];
    const answers = await Promise.all(
        unknownResourceIds.map(async (resourceInstanceId) => {
            try {
                return await fetchCanEditResource(
                    archesFetch,
                    session,
                    resourceInstanceId,
                );
            } catch {
                return false;
            }
        }),
    );
    const updated = new Map(editableResourceIds.value);
    unknownResourceIds.forEach((resourceInstanceId, index) =>
        updated.set(resourceInstanceId, answers[index]),
    );
    editableResourceIds.value = updated;
}

function isBlocked(pendingChange: PendingChange): boolean {
    const resourceInstanceId = affectedResourceId(pendingChange);
    return (
        resourceInstanceId !== null &&
        editableResourceIds.value.get(resourceInstanceId) === false
    );
}

function setIncluded(key: string, isIncluded: boolean): void {
    pendingChanges.value = pendingChanges.value.map((pendingChange) =>
        pendingChange.key === key
            ? { ...pendingChange, isIncluded }
            : pendingChange,
    );
}

async function setTarget(key: string, target: ChangeTarget): Promise<void> {
    pendingChanges.value = pendingChanges.value.map((pendingChange) =>
        pendingChange.key === key
            ? { ...pendingChange, target }
            : pendingChange,
    );
    await learnEditPermissions(pendingChanges.value);
    pendingChanges.value = pendingChanges.value.map((pendingChange) =>
        pendingChange.key === key && isBlocked(pendingChange)
            ? { ...pendingChange, isIncluded: false }
            : pendingChange,
    );
}

async function pushToArches(): Promise<void> {
    const session = workspace.session;
    if (!loadedLayer.value || !session) {
        return;
    }
    isPushing.value = true;
    statusMessage.value = "";
    errorMessage.value = "";
    try {
        const pushResult = await pushLayerChanges(
            geolibreApp,
            archesFetch,
            session,
            loadedLayer.value,
            pendingChanges.value,
        );
        statusMessage.value = describePush(pushResult);
        errorMessage.value = pushResult.failures.join("\n");
        trackProvisionalTiles(pushResult);

        replaceLayer(
            await reloadArchesLayer(
                geolibreApp,
                archesFetch,
                session,
                loadedLayer.value,
                { afterPush: true },
            ),
        );
    } catch (error) {
        errorMessage.value = String(error);
    } finally {
        isPushing.value = false;
    }
}

function replaceLayer(reloadedLayer: LoadedArchesLayer): void {
    workspace.loadedLayers = workspace.loadedLayers.map((candidate) =>
        candidate.layerId === props.layerId ? reloadedLayer : candidate,
    );
}

function trackProvisionalTiles(pushResult: PushResult): void {
    const session = workspace.session;
    if (
        !session ||
        !loadedLayer.value ||
        pushResult.provisionalTileIds.length === 0
    ) {
        return;
    }
    const nodeId = loadedLayer.value.node.nodeid;
    workspace.trackedReviewTiles = mergeTrackedReviewTiles(
        workspace.trackedReviewTiles,
        pushResult.provisionalTileIds.map((tileId) => ({ tileId, nodeId })),
    );
    saveTrackedReviewTiles(session, workspace.trackedReviewTiles);
}

function describePush(pushResult: PushResult): string {
    const parts = [
        $gettext(
            "Saved %{tileCount} tile(s); created %{resourceCount} resource(s).",
            {
                tileCount: pushResult.savedTileCount,
                resourceCount: pushResult.createdResourceIds.length,
            },
        ),
    ];
    if (pushResult.deletedTileCount > 0) {
        parts.push(
            $gettext("Deleted %{count} tile(s) left without geometry.", {
                count: pushResult.deletedTileCount,
            }),
        );
    }
    if (pushResult.clearedTileCount > 0) {
        parts.push(
            $gettext(
                "Cleared the geometry of %{count} tile(s) that couldn't be deleted.",
                { count: pushResult.clearedTileCount },
            ),
        );
    }
    if (pushResult.provisionalTileIds.length > 0) {
        parts.push(
            $gettext(
                "%{count} edit(s) await review in Arches and won't show on the map until approved.",
                { count: pushResult.provisionalTileIds.length },
            ),
        );
    }
    return parts.join(" ");
}

function countOf(kind: PendingChange["change"]["kind"]): number {
    return pendingChanges.value.filter(
        (pendingChange) => pendingChange.change.kind === kind,
    ).length;
}
</script>

<template>
    <div
        v-if="loadedLayer"
        class="layer-changes"
    >
        <strong>{{
            archesLayerName(loadedLayer.node, loadedLayer.source)
        }}</strong>
        <div class="layer-actions">
            <Button
                :label="$gettext('Check')"
                size="small"
                severity="secondary"
                :loading="isChecking"
                @click="checkForChanges"
            />
            <Button
                :label="$gettext('Push to Arches')"
                size="small"
                :disabled="!loadedLayer.isWritable || includedCount === 0"
                :loading="isPushing"
                @click="pushToArches"
            />
        </div>
        <span v-if="hasChecked">
            {{
                $gettext(
                    "%{edited} edited, %{created} new, %{deleted} deleted",
                    {
                        edited: countOf("updated"),
                        created: countOf("created"),
                        deleted: countOf("deleted"),
                    },
                )
            }}
        </span>
        <span v-if="!loadedLayer.isWritable">{{ $gettext("Read only") }}</span>
        <ul
            v-if="pendingChanges.length > 0"
            class="change-list"
        >
            <ChangeItem
                v-for="pendingChange in pendingChanges"
                :key="pendingChange.key"
                :pending-change="pendingChange"
                :graph-id="loadedLayer.node.graph_id"
                :is-blocked="isBlocked(pendingChange)"
                @update:is-included="setIncluded(pendingChange.key, $event)"
                @update:target="setTarget(pendingChange.key, $event)"
            />
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
    </div>
</template>

<style scoped>
.layer-changes {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.layer-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
}

.change-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 20rem;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
}
</style>
