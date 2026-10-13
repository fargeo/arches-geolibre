<script setup lang="ts">
import { ref } from "vue";

import { useGettext } from "vue3-gettext";

import Button from "openvue/button";
import InputText from "openvue/inputtext";
import Message from "openvue/message";
import Password from "openvue/password";

import { useArchesFetch } from "@/arches_geolibre/composables/use-geolibre-app.ts";
import {
    ArchesRequestError,
    signInWithPassword,
} from "@/arches_geolibre/utils/arches-client.ts";

import type { ArchesSession } from "@/arches_geolibre/types.ts";

const UNAUTHORIZED_STATUS_CODES = [400, 401];

const props = defineProps<{ instanceUrl: string }>();

const emit = defineEmits<{
    (event: "signed-in", session: ArchesSession): void;
}>();

const archesFetch = useArchesFetch();
const { $gettext } = useGettext();

const username = ref("");
const password = ref("");
const isSigningIn = ref(false);
const errorMessage = ref("");

async function signIn(): Promise<void> {
    isSigningIn.value = true;
    errorMessage.value = "";
    try {
        emit(
            "signed-in",
            await signInWithPassword(
                archesFetch,
                props.instanceUrl,
                username.value,
                password.value,
            ),
        );
        password.value = "";
    } catch (error) {
        errorMessage.value = describeSignInError(error);
    } finally {
        isSigningIn.value = false;
    }
}

function describeSignInError(error: unknown): string {
    if (
        error instanceof ArchesRequestError &&
        UNAUTHORIZED_STATUS_CODES.includes(error.status)
    ) {
        return $gettext("The username or password is incorrect.");
    }
    return $gettext("Could not reach Arches at %{url}: %{reason}", {
        url: props.instanceUrl,
        reason: String(error),
    });
}
</script>

<template>
    <form
        class="password-sign-in"
        @submit.prevent="signIn"
    >
        <InputText
            v-model="username"
            :placeholder="$gettext('Username')"
            :aria-label="$gettext('Username')"
            autocomplete="username"
            required
        />
        <Password
            v-model="password"
            :placeholder="$gettext('Password')"
            :input-props="{ 'aria-label': $gettext('Password') }"
            :feedback="false"
            autocomplete="current-password"
            fluid
            required
        />
        <Button
            type="submit"
            :label="$gettext('Sign in')"
            :disabled="!instanceUrl"
            :loading="isSigningIn"
        />
        <Message
            v-if="errorMessage"
            severity="error"
            size="small"
        >
            {{ errorMessage }}
        </Message>
    </form>
</template>

<style scoped>
.password-sign-in {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}
</style>
