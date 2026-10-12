<script setup lang="ts">
import { onMounted, ref } from "vue";

import { useGettext } from "vue3-gettext";

import Message from "openvue/message";

import SessionSummary from "@/arches_geolibre/components/ConnectionSection/components/SessionSummary.vue";
import SignInForm from "@/arches_geolibre/components/ConnectionSection/components/SignInForm.vue";

import { CREDENTIAL_SESSION_NAME } from "@/arches_geolibre/constants.ts";
import { useArchesWorkspace } from "@/arches_geolibre/composables/use-arches-workspace.ts";
import {
    useArchesFetch,
    useGeoLibreApp,
} from "@/arches_geolibre/composables/use-geolibre-app.ts";
import { refreshSession } from "@/arches_geolibre/utils/arches-client.ts";
import { removeLayer } from "@/arches_geolibre/utils/arches-layers.ts";
import { loadTrackedReviewTiles } from "@/arches_geolibre/utils/pending-review.ts";

import type { ArchesSession } from "@/arches_geolibre/types.ts";

const workspace = useArchesWorkspace();
const geolibreApp = useGeoLibreApp();
const archesFetch = useArchesFetch();
const { $gettext } = useGettext();

const isRestoring = ref(false);
const errorMessage = ref("");

onMounted(async () => {
    if (!workspace.session) {
        await restoreSavedSession();
    }
});

async function restoreSavedSession(): Promise<void> {
    const savedSession = geolibreApp.credentials?.get(CREDENTIAL_SESSION_NAME);
    if (!savedSession) {
        return;
    }
    isRestoring.value = true;
    try {
        startSession(
            await refreshSession(
                archesFetch,
                JSON.parse(savedSession) as ArchesSession,
            ),
        );
    } catch {
        errorMessage.value = $gettext(
            "Your saved Arches session has expired. Sign in again.",
        );
        geolibreApp.credentials?.set(CREDENTIAL_SESSION_NAME, "");
    } finally {
        isRestoring.value = false;
    }
}

function startSession(session: ArchesSession): void {
    errorMessage.value = "";
    geolibreApp.credentials?.set(
        CREDENTIAL_SESSION_NAME,
        JSON.stringify(session),
    );
    workspace.session = session;
    workspace.trackedReviewTiles = loadTrackedReviewTiles(session);
}

function signOut(): void {
    geolibreApp.credentials?.set(CREDENTIAL_SESSION_NAME, "");
    workspace.session = null;
    workspace.trackedReviewTiles = [];
    if (workspace.awaitingReviewLayerId) {
        removeLayer(geolibreApp, workspace.awaitingReviewLayerId);
        workspace.awaitingReviewLayerId = null;
    }
}
</script>

<template>
    <section class="connection-section">
        <h3>{{ $gettext("Arches connection") }}</h3>
        <SessionSummary
            v-if="workspace.session"
            :instance-url="workspace.session.instanceUrl"
            :username="workspace.session.username"
            :is-reviewer="workspace.session.isReviewer"
            @sign-out="signOut"
        />
        <p v-else-if="isRestoring">{{ $gettext("Reconnecting…") }}</p>
        <SignInForm
            v-else
            :initial-instance-url="workspace.projectInstanceUrl"
            @signed-in="startSession"
        />
        <Message
            v-if="errorMessage"
            severity="warn"
            size="small"
        >
            {{ errorMessage }}
        </Message>
    </section>
</template>

<style scoped>
.connection-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

h3 {
    margin: 0;
    font-size: 1rem;
}
</style>
