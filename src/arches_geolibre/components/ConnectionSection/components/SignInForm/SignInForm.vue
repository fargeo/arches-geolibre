<script setup lang="ts">
import { computed, ref, watch } from "vue";

import Button from "openvue/button";
import InputText from "openvue/inputtext";
import Message from "openvue/message";

import DeviceSignIn from "@/arches_geolibre/components/ConnectionSection/components/SignInForm/components/DeviceSignIn.vue";
import PasswordSignIn from "@/arches_geolibre/components/ConnectionSection/components/SignInForm/components/PasswordSignIn.vue";

import { normalizeInstanceUrl } from "@/arches_geolibre/utils/arches-client.ts";

import type { ArchesSession } from "@/arches_geolibre/types.ts";

const props = defineProps<{ initialInstanceUrl: string | null }>();

const emit = defineEmits<{
    (event: "signed-in", session: ArchesSession): void;
}>();

const enteredInstanceUrl = ref(props.initialInstanceUrl ?? "");
const isUsingPassword = ref(false);
const isDeviceSignInUnavailable = ref(false);

const instanceUrl = computed(() =>
    normalizeInstanceUrl(enteredInstanceUrl.value),
);

watch(instanceUrl, () => {
    isDeviceSignInUnavailable.value = false;
});

function switchToPasswordSignIn(): void {
    isDeviceSignInUnavailable.value = true;
    isUsingPassword.value = true;
}
</script>

<template>
    <div class="sign-in-form">
        <InputText
            v-model="enteredInstanceUrl"
            :placeholder="
                $gettext('Arches URL, e.g. https://arches.example.org')
            "
            :aria-label="$gettext('Arches URL')"
            type="url"
        />
        <PasswordSignIn
            v-if="isUsingPassword"
            :instance-url="instanceUrl"
            @signed-in="emit('signed-in', $event)"
        />
        <DeviceSignIn
            v-else
            :instance-url="instanceUrl"
            @signed-in="emit('signed-in', $event)"
            @unavailable="switchToPasswordSignIn"
        />
        <Message
            v-if="isUsingPassword && isDeviceSignInUnavailable"
            severity="info"
            size="small"
        >
            {{
                $gettext(
                    "This Arches instance doesn't offer browser sign-in. Sign in with a password instead.",
                )
            }}
        </Message>
        <Button
            :label="
                isUsingPassword
                    ? $gettext('Sign in with browser instead')
                    : $gettext('Use a password instead')
            "
            size="small"
            text
            @click="isUsingPassword = !isUsingPassword"
        />
    </div>
</template>

<style scoped>
.sign-in-form {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}
</style>
