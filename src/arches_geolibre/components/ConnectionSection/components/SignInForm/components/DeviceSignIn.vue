<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";

import { useGettext } from "vue3-gettext";

import Button from "openvue/button";
import Message from "openvue/message";

import { useDescribeRequestError } from "@/arches_geolibre/composables/use-describe-request-error.ts";
import {
    useArchesFetch,
    useOpenExternalUrl,
} from "@/arches_geolibre/composables/use-geolibre-app.ts";
import {
    DeviceSignInError,
    startDeviceSignIn,
    waitForDeviceApproval,
} from "@/arches_geolibre/utils/device-sign-in.ts";

import type { ArchesSession } from "@/arches_geolibre/types.ts";
import type { DeviceSignIn } from "@/arches_geolibre/utils/device-sign-in.ts";

const props = defineProps<{ instanceUrl: string }>();

const emit = defineEmits<{
    (event: "signed-in", session: ArchesSession): void;
    (event: "unavailable"): void;
}>();

const archesFetch = useArchesFetch();
const openExternalUrl = useOpenExternalUrl();
const { $gettext } = useGettext();
const describeRequestError = useDescribeRequestError();

const isStarting = ref(false);
const pendingSignIn = ref<DeviceSignIn | null>(null);
const errorMessage = ref("");

let abortController: AbortController | null = null;

onBeforeUnmount(cancel);

async function signIn(): Promise<void> {
    isStarting.value = true;
    errorMessage.value = "";
    abortController = new AbortController();
    const { signal } = abortController;
    try {
        const deviceSignIn = await startDeviceSignIn(
            archesFetch,
            props.instanceUrl,
        );
        pendingSignIn.value = deviceSignIn;
        isStarting.value = false;
        openExternalUrl(deviceSignIn.verificationUrl);
        emit(
            "signed-in",
            await waitForDeviceApproval(archesFetch, deviceSignIn, signal),
        );
    } catch (error) {
        if (!signal.aborted) {
            errorMessage.value = describeSignInError(error);
        }
    } finally {
        isStarting.value = false;
        pendingSignIn.value = null;
    }
}

function cancel(): void {
    abortController?.abort();
    abortController = null;
}

function describeSignInError(error: unknown): string {
    if (error instanceof DeviceSignInError) {
        if (error.reason === "not-enabled") {
            emit("unavailable");
            return "";
        }
        if (error.reason === "denied") {
            return $gettext("The sign-in was declined in the browser.");
        }
        return $gettext(
            "The sign-in code expired before it was approved. Try again.",
        );
    }
    return describeRequestError(error);
}
</script>

<template>
    <div class="device-sign-in">
        <template v-if="pendingSignIn">
            <p>
                {{
                    $gettext(
                        "Approve the sign-in in your browser. Check that it shows this code:",
                    )
                }}
            </p>
            <output class="user-code">{{ pendingSignIn.userCode }}</output>
            <p class="waiting">{{ $gettext("Waiting for approval…") }}</p>
            <div class="actions">
                <Button
                    :label="$gettext('Open the page again')"
                    severity="secondary"
                    size="small"
                    @click="openExternalUrl(pendingSignIn.verificationUrl)"
                />
                <Button
                    :label="$gettext('Cancel')"
                    severity="secondary"
                    size="small"
                    text
                    @click="cancel"
                />
            </div>
        </template>
        <Button
            v-else
            :label="$gettext('Sign in with browser')"
            :disabled="!instanceUrl"
            :loading="isStarting"
            @click="signIn"
        />
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
.device-sign-in {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

p {
    margin: 0;
}

.user-code {
    font-family: monospace;
    font-size: 1.5rem;
    letter-spacing: 0.1em;
    text-align: center;
}

.waiting {
    color: var(--arches-geolibre-text-muted-color);
}

.actions {
    display: flex;
    gap: 0.5rem;
}
</style>
