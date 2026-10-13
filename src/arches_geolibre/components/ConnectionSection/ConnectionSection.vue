<script setup lang="ts">
import { onMounted, ref } from "vue";

import Message from "openvue/message";

import SessionSummary from "@/arches_geolibre/components/ConnectionSection/components/SessionSummary.vue";
import SignInForm from "@/arches_geolibre/components/ConnectionSection/components/SignInForm/SignInForm.vue";

import { useArchesWorkspace } from "@/arches_geolibre/composables/use-arches-workspace.ts";
import {
    useArchesFetch,
    useGeoLibreApp,
} from "@/arches_geolibre/composables/use-geolibre-app.ts";
import { refreshSession } from "@/arches_geolibre/utils/arches-client.ts";
import {
    endSession,
    readSavedSession,
    startSession,
} from "@/arches_geolibre/utils/arches-session.ts";

import type { ArchesSession } from "@/arches_geolibre/types.ts";

const workspace = useArchesWorkspace();
const geolibreApp = useGeoLibreApp();
const archesFetch = useArchesFetch();

const isRestoring = ref(false);

onMounted(async () => {
    if (!workspace.session) {
        await restoreSavedSession();
    }
});

async function restoreSavedSession(): Promise<void> {
    const savedSession = readSavedSession(geolibreApp);
    if (!savedSession) {
        return;
    }
    isRestoring.value = true;
    try {
        signIn(await refreshSession(archesFetch, savedSession), true);
    } catch {
        endSession(geolibreApp, workspace);
        workspace.hasSessionExpired = true;
    } finally {
        isRestoring.value = false;
    }
}

function signIn(session: ArchesSession, shouldSave: boolean): void {
    startSession(geolibreApp, workspace, session, shouldSave);
}

function signOut(): void {
    endSession(geolibreApp, workspace);
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
            @signed-in="signIn"
        />
        <Message
            v-if="workspace.hasSessionExpired && !workspace.session"
            severity="warn"
            size="small"
        >
            {{ $gettext("Your Arches session has expired. Sign in again.") }}
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
