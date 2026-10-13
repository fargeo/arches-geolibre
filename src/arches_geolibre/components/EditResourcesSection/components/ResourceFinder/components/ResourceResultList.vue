<script setup lang="ts">
import { computed } from "vue";

import Button from "openvue/button";
import Tag from "openvue/tag";

import { useWorklist } from "@/arches_geolibre/composables/use-worklist.ts";

import type { ResourceResult } from "@/arches_geolibre/components/EditResourcesSection/components/ResourceFinder/types.ts";

const props = defineProps<{
    results: ResourceResult[];
    isAdding: boolean;
}>();

const emit = defineEmits<{
    (event: "add", resources: ResourceResult[]): void;
}>();

const { worklist } = useWorklist();

const worklistResourceIds = computed(
    () =>
        new Set(
            worklist.value?.entries.map((entry) => entry.resourceInstanceId),
        ),
);
const addableResults = computed(() =>
    props.results.filter(
        (result) => !worklistResourceIds.value.has(result.resourceInstanceId),
    ),
);
</script>

<template>
    <div class="resource-result-list">
        <ul>
            <li
                v-for="result in results"
                :key="result.resourceInstanceId"
            >
                <span class="result-name">
                    {{ result.name || $gettext("Unnamed resource") }}
                </span>
                <Tag
                    v-if="result.hasGeometry === false"
                    :value="$gettext('No geometry')"
                    severity="warn"
                />
                <Tag
                    v-else-if="result.hasGeometry"
                    :value="$gettext('Has geometry')"
                    severity="secondary"
                />
                <span
                    v-if="worklistResourceIds.has(result.resourceInstanceId)"
                    class="in-worklist"
                >
                    {{ $gettext("In worklist") }}
                </span>
                <Button
                    v-else
                    :label="$gettext('Add')"
                    :aria-label="
                        $gettext('Add %{name} to the worklist', {
                            name: result.name,
                        })
                    "
                    size="small"
                    severity="secondary"
                    :disabled="isAdding"
                    @click="emit('add', [result])"
                />
            </li>
        </ul>
        <Button
            v-if="addableResults.length > 1"
            :label="
                $gettext('Add all %{count}', {
                    count: addableResults.length,
                })
            "
            size="small"
            severity="secondary"
            text
            :loading="isAdding"
            @click="emit('add', addableResults)"
        />
    </div>
</template>

<style scoped>
.resource-result-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}

ul {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
}

li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.result-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.in-worklist {
    color: var(--arches-geolibre-text-muted-color);
    font-size: 0.75rem;
}
</style>
