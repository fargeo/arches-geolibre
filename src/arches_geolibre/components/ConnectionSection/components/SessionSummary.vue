<script setup lang="ts">
import Button from "openvue/button";
import Message from "openvue/message";

defineProps<{
    instanceUrl: string;
    username: string;
    isReviewer: boolean;
}>();

const emit = defineEmits<{
    (event: "sign-out"): void;
}>();
</script>

<template>
    <div class="session-summary">
        <div class="signed-in">
            <span>
                {{
                    $gettext("Signed in to %{instanceUrl} as %{username}", {
                        instanceUrl,
                        username,
                    })
                }}
            </span>
            <Button
                :label="$gettext('Sign out')"
                size="small"
                severity="secondary"
                @click="emit('sign-out')"
            />
        </div>
        <Message
            v-if="!isReviewer"
            severity="info"
            size="small"
        >
            {{
                $gettext(
                    "Your edits will be saved as provisional and appear on the map once a reviewer approves them.",
                )
            }}
        </Message>
    </div>
</template>

<style scoped>
.session-summary {
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
