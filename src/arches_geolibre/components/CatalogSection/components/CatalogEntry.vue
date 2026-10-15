<script setup lang="ts">
import Button from "openvue/button";
import ProgressSpinner from "openvue/progressspinner";

defineProps<{
    label: string;
    isLoading: boolean;
    isDisabled: boolean;
    /** Offers a read-only overview from Arches' vector tiles as well. */
    canAddOverview?: boolean;
}>();

const emit = defineEmits<{
    (event: "add"): void;
    (event: "add-overview"): void;
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
        <template v-else>
            <Button
                v-if="canAddOverview"
                :label="$gettext('Overview')"
                :aria-label="
                    $gettext(
                        'Add a read-only overview of %{label} from map tiles',
                        { label },
                    )
                "
                size="small"
                severity="secondary"
                :disabled="isDisabled"
                @click="emit('add-overview')"
            />
            <Button
                :label="$gettext('Add')"
                :aria-label="$gettext('Add %{label} to the map', { label })"
                size="small"
                :disabled="isDisabled"
                @click="emit('add')"
            />
        </template>
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
