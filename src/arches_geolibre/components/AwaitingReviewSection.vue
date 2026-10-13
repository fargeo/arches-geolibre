<script setup lang="ts">
import { ref, watch } from "vue";

import { useGettext } from "vue3-gettext";

import Button from "openvue/button";
import Message from "openvue/message";

import { useArchesWorkspace } from "@/arches_geolibre/composables/use-arches-workspace.ts";
import { useDescribeRequestError } from "@/arches_geolibre/composables/use-describe-request-error.ts";
import {
    useArchesFetch,
    useGeoLibreApp,
} from "@/arches_geolibre/composables/use-geolibre-app.ts";
import { removeLayer } from "@/arches_geolibre/utils/arches-layers.ts";
import { buildArchesLayerStyle } from "@/arches_geolibre/utils/layer-style.ts";
import {
    fetchOwnPendingFeatures,
    saveTrackedReviewTiles,
} from "@/arches_geolibre/utils/pending-review.ts";

const AWAITING_REVIEW_STYLE = {
    fillColor: "rgba(245, 158, 11, 0.35)",
    lineColor: "rgba(217, 119, 6, 0.9)",
    pointColor: "rgba(217, 119, 6, 0.9)",
    outlineColor: "rgba(217, 119, 6, 0.9)",
    weight: 2,
    radius: 3,
};

const workspace = useArchesWorkspace();
const geolibreApp = useGeoLibreApp();
const archesFetch = useArchesFetch();
const { $gettext } = useGettext();
const describeRequestError = useDescribeRequestError();

const pendingFeatureCount = ref(0);
const isRefreshing = ref(false);
const errorMessage = ref("");

watch(
    () => workspace.trackedReviewTiles.map((tile) => tile.tileId).join(","),
    async () => {
        await refreshOverlay();
    },
    { immediate: true },
);

async function refreshOverlay(): Promise<void> {
    const session = workspace.session;
    if (!session || session.isReviewer) {
        return;
    }
    isRefreshing.value = true;
    errorMessage.value = "";
    try {
        const { features, stillPending } = await fetchOwnPendingFeatures(
            archesFetch,
            session,
            workspace.trackedReviewTiles,
        );
        if (stillPending.length !== workspace.trackedReviewTiles.length) {
            saveTrackedReviewTiles(session, stillPending);
            workspace.trackedReviewTiles = stillPending;
        }
        replaceOverlayLayer(features);
        pendingFeatureCount.value = features.length;
    } catch (error) {
        errorMessage.value = $gettext(
            "Could not read your edits awaiting review. %{reason}",
            { reason: describeRequestError(error) },
        );
    } finally {
        isRefreshing.value = false;
    }
}

function replaceOverlayLayer(
    features: Awaited<ReturnType<typeof fetchOwnPendingFeatures>>["features"],
): void {
    if (workspace.awaitingReviewLayerId) {
        removeLayer(geolibreApp, workspace.awaitingReviewLayerId);
        workspace.awaitingReviewLayerId = null;
    }
    if (features.length === 0) {
        return;
    }
    const layerId = geolibreApp.addGeoJsonLayer(
        $gettext("Awaiting review (read only)"),
        { type: "FeatureCollection", features },
        `arches://${new URL(workspace.session?.instanceUrl ?? "").host}/awaiting-review`,
    );
    geolibreApp.importLayerStyle?.(
        layerId,
        buildArchesLayerStyle(AWAITING_REVIEW_STYLE),
    );
    workspace.awaitingReviewLayerId = layerId;
}
</script>

<template>
    <section
        v-if="workspace.trackedReviewTiles.length > 0"
        class="awaiting-review-section"
    >
        <h3>{{ $gettext("Awaiting review") }}</h3>
        <div class="summary">
            <span>
                {{
                    $ngettext(
                        "%{count} of your edits is waiting for a reviewer. It's drawn in orange on the map.",
                        "%{count} of your edits are waiting for a reviewer. They're drawn in orange on the map.",
                        workspace.trackedReviewTiles.length,
                        { count: workspace.trackedReviewTiles.length },
                    )
                }}
            </span>
            <Button
                :label="$gettext('Refresh')"
                size="small"
                severity="secondary"
                :loading="isRefreshing"
                @click="refreshOverlay"
            />
        </div>
        <small v-if="pendingFeatureCount === 0 && !isRefreshing">
            {{
                $gettext(
                    "Your pending edits remove geometry, so there's nothing to draw.",
                )
            }}
        </small>
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
.awaiting-review-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

h3 {
    margin: 0;
    font-size: 1rem;
}

.summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
}
</style>
