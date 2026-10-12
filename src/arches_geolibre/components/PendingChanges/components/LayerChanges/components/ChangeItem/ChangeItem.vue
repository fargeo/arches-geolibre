<script setup lang="ts">
import { computed } from "vue";

import { useGettext } from "vue3-gettext";

import Checkbox from "openvue/checkbox";

import AttachTargetPicker from "@/arches_geolibre/components/PendingChanges/components/LayerChanges/components/ChangeItem/components/AttachTargetPicker.vue";

import { isFreshlyDrawn } from "@/arches_geolibre/utils/push-plan.ts";

import type {
    ChangeTarget,
    PendingChange,
} from "@/arches_geolibre/utils/push-plan.ts";

const props = defineProps<{
    pendingChange: PendingChange;
    graphId: string;
    isBlocked: boolean;
}>();

const emit = defineEmits<{
    (event: "update:is-included", isIncluded: boolean): void;
    (event: "update:target", target: ChangeTarget): void;
}>();

const { $gettext } = useGettext();

const isNewFeature = computed(() => isFreshlyDrawn(props.pendingChange.change));
const kindLabel = computed(() => {
    switch (props.pendingChange.change.kind) {
        case "updated":
            return $gettext("Edited");
        case "deleted":
            return $gettext("Deleted");
        default:
            return isNewFeature.value
                ? $gettext("New feature")
                : $gettext("New part");
    }
});
const resourceName = computed(() => {
    const primaryName =
        props.pendingChange.change.feature.properties?.primary_name;
    return typeof primaryName === "string" && primaryName ? primaryName : null;
});
const checkboxId = computed(() => `include-${props.pendingChange.key}`);
</script>

<template>
    <li class="change-item">
        <div class="change-summary">
            <Checkbox
                :model-value="pendingChange.isIncluded"
                :input-id="checkboxId"
                :disabled="isBlocked"
                binary
                @update:model-value="emit('update:is-included', $event)"
            />
            <label :for="checkboxId">
                <strong>{{ kindLabel }}</strong>
                <span v-if="resourceName">: {{ resourceName }}</span>
            </label>
        </div>
        <small v-if="isBlocked">
            {{
                $gettext(
                    "You can't edit this resource, so this change won't be pushed.",
                )
            }}
        </small>
        <small v-else-if="!pendingChange.isIncluded">
            {{
                $gettext("Won't be pushed; Arches keeps its current geometry.")
            }}
        </small>
        <AttachTargetPicker
            v-if="isNewFeature && pendingChange.isIncluded"
            :target="pendingChange.target"
            :graph-id="graphId"
            @update:target="emit('update:target', $event)"
        />
    </li>
</template>

<style scoped>
.change-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding-block-end: 0.5rem;
    border-block-end: 0.0625rem solid
        var(--arches-geolibre-content-border-color);
}

.change-summary {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}
</style>
