<script setup lang="ts">
import Button from "openvue/button";
import ProgressSpinner from "openvue/progressspinner";

defineProps<{
    label: string;
    isLoading: boolean;
    isDisabled: boolean;
}>();

const emit = defineEmits<{
    (event: "add"): void;
    (event: "cancel"): void;
}>();
</script>

<template>
    <li class="catalog-entry">
        <span class="entry-label">{{ label }}</span>
        <template v-if="isLoading">
            <ProgressSpinner
                class="loading-spinner"
                stroke-width="6"
                :aria-label="$gettext('Loading')"
            />
            <Button
                :label="$gettext('Cancel')"
                size="small"
                severity="secondary"
                @click="emit('cancel')"
            />
        </template>
        <Button
            v-else
            :label="$gettext('Add')"
            :aria-label="$gettext('Add %{label} to the map', { label })"
            size="small"
            :disabled="isDisabled"
            @click="emit('add')"
        />
    </li>
</template>

<style scoped>
.catalog-entry {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.entry-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
}

.loading-spinner {
    width: 1.25rem;
    height: 1.25rem;
    margin: 0;
}
</style>
