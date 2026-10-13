<script setup lang="ts">
import Button from "openvue/button";

defineProps<{ page: number; hasNextPage: boolean }>();

const emit = defineEmits<{
    (event: "go-to-page", pageNumber: number): void;
}>();
</script>

<template>
    <div
        v-if="page > 1 || hasNextPage"
        class="result-pager"
    >
        <Button
            :label="$gettext('Previous')"
            size="small"
            severity="secondary"
            text
            :disabled="page <= 1"
            @click="emit('go-to-page', page - 1)"
        />
        <span>{{ $gettext("Page %{page}", { page: String(page) }) }}</span>
        <Button
            :label="$gettext('Next page')"
            size="small"
            severity="secondary"
            text
            :disabled="!hasNextPage"
            @click="emit('go-to-page', page + 1)"
        />
    </div>
</template>

<style scoped>
.result-pager {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.75rem;
}
</style>
