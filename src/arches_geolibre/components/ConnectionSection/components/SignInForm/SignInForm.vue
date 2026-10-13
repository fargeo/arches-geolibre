<script setup lang="ts">
import { computed, ref, watch } from "vue";

import Button from "openvue/button";
import Checkbox from "openvue/checkbox";
import InputText from "openvue/inputtext";
import Message from "openvue/message";

import DeviceSignIn from "@/arches_geolibre/components/ConnectionSection/components/SignInForm/components/DeviceSignIn.vue";
import PasswordSignIn from "@/arches_geolibre/components/ConnectionSection/components/SignInForm/components/PasswordSignIn.vue";

import { useGeoLibreApp } from "@/arches_geolibre/composables/use-geolibre-app.ts";
import { normalizeInstanceUrl } from "@/arches_geolibre/utils/arches-client.ts";
import { isSessionSavingOptional } from "@/arches_geolibre/utils/arches-session.ts";
import { isBlockedAsMixedContent } from "@/arches_geolibre/utils/mixed-content.ts";

import type { ArchesSession } from "@/arches_geolibre/types.ts";

const props = defineProps<{ initialInstanceUrl: string | null }>();

const emit = defineEmits<{
    (event: "signed-in", session: ArchesSession, shouldSave: boolean): void;
}>();

const geolibreApp = useGeoLibreApp();
const canChooseToStaySignedIn = isSessionSavingOptional(geolibreApp);

const enteredInstanceUrl = ref(props.initialInstanceUrl ?? "");
const isUsingPassword = ref(false);
const isDeviceSignInUnavailable = ref(false);
const staySignedIn = ref(false);

const instanceUrl = computed(() =>
    normalizeInstanceUrl(enteredInstanceUrl.value),
);

const isMixedContent = computed(() =>
    isBlockedAsMixedContent(instanceUrl.value, window.location.href),
);
const usableInstanceUrl = computed(() =>
    isMixedContent.value ? "" : instanceUrl.value,
);

watch(instanceUrl, () => {
    isDeviceSignInUnavailable.value = false;
});

function finishSignIn(session: ArchesSession): void {
    emit("signed-in", session, !canChooseToStaySignedIn || staySignedIn.value);
}

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
        <Message
            v-if="isMixedContent"
            severity="warn"
            size="small"
        >
            {{
                $gettext(
                    "GeoLibre on the web can only reach Arches over HTTPS. Use an https:// address, or GeoLibre Desktop.",
                )
            }}
        </Message>
        <div
            v-if="canChooseToStaySignedIn"
            class="stay-signed-in"
        >
            <Checkbox
                v-model="staySignedIn"
                input-id="arches-stay-signed-in"
                binary
            />
            <label for="arches-stay-signed-in">
                {{ $gettext("Stay signed in on this browser") }}
            </label>
        </div>
        <PasswordSignIn
            v-if="isUsingPassword"
            :instance-url="usableInstanceUrl"
            @signed-in="finishSignIn"
        />
        <DeviceSignIn
            v-else
            :instance-url="usableInstanceUrl"
            @signed-in="finishSignIn"
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

.stay-signed-in {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
}
</style>
