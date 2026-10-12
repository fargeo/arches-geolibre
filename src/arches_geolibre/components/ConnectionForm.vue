<script setup lang="ts">
import { onMounted, ref } from "vue";

import Button from "openvue/button";
import InputText from "openvue/inputtext";
import Message from "openvue/message";
import Password from "openvue/password";

import { CREDENTIAL_SESSION_NAME } from "@/arches_geolibre/constants.ts";
import {
    useArchesFetch,
    useGeoLibreApp,
} from "@/arches_geolibre/composables/use-geolibre-app.ts";
import {
    refreshSession,
    signInWithPassword,
} from "@/arches_geolibre/utils/arches-client.ts";

import type { ArchesSession } from "@/arches_geolibre/types.ts";

const DEFAULT_INSTANCE_URL = "http://localhost:8000";

defineProps<{ session: ArchesSession | null }>();

const emit = defineEmits<{
    (event: "signed-in", session: ArchesSession): void;
    (event: "signed-out"): void;
}>();

const geolibreApp = useGeoLibreApp();
const archesFetch = useArchesFetch();

const instanceUrl = ref(DEFAULT_INSTANCE_URL);
const username = ref("");
const password = ref("");
const isSigningIn = ref(false);
const errorMessage = ref("");
const credentialLocation = geolibreApp.credentials?.location() ?? "none";

onMounted(async () => {
    await restoreSavedSession();
});

async function restoreSavedSession(): Promise<void> {
    const savedSession = geolibreApp.credentials?.get(CREDENTIAL_SESSION_NAME);
    if (!savedSession) {
        return;
    }
    try {
        const refreshedSession = await refreshSession(
            archesFetch,
            JSON.parse(savedSession) as ArchesSession,
        );
        rememberSession(refreshedSession);
    } catch (error) {
        errorMessage.value = `Saved session could not be restored: ${String(error)}`;
        geolibreApp.credentials?.set(CREDENTIAL_SESSION_NAME, "");
    }
}

async function signIn(): Promise<void> {
    isSigningIn.value = true;
    errorMessage.value = "";
    try {
        rememberSession(
            await signInWithPassword(
                archesFetch,
                instanceUrl.value,
                username.value,
                password.value,
            ),
        );
        password.value = "";
    } catch (error) {
        errorMessage.value = String(error);
    } finally {
        isSigningIn.value = false;
    }
}

function rememberSession(signedInSession: ArchesSession): void {
    instanceUrl.value = signedInSession.instanceUrl;
    geolibreApp.credentials?.set(
        CREDENTIAL_SESSION_NAME,
        JSON.stringify(signedInSession),
    );
    emit("signed-in", signedInSession);
}

function signOut(): void {
    geolibreApp.credentials?.set(CREDENTIAL_SESSION_NAME, "");
    emit("signed-out");
}
</script>

<template>
    <section class="connection-form">
        <h3>Arches connection</h3>
        <div
            v-if="session"
            class="signed-in"
        >
            <span>
                Signed in to {{ session.instanceUrl }} as {{ session.username }}
            </span>
            <Button
                label="Sign out"
                size="small"
                severity="secondary"
                @click="signOut"
            />
        </div>
        <form
            v-else
            class="sign-in"
            @submit.prevent="signIn"
        >
            <InputText
                v-model="instanceUrl"
                placeholder="Arches URL"
                aria-label="Arches URL"
            />
            <InputText
                v-model="username"
                placeholder="Username"
                aria-label="Username"
                autocomplete="username"
            />
            <Password
                v-model="password"
                placeholder="Password"
                aria-label="Password"
                :feedback="false"
                input-class="password-input"
                fluid
            />
            <Button
                type="submit"
                label="Sign in"
                :loading="isSigningIn"
            />
            <small>Session stored in: {{ credentialLocation }}</small>
        </form>
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

.sign-in {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.signed-in {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
}
</style>
