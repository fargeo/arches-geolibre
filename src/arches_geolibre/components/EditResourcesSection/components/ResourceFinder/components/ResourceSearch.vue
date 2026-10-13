<script setup lang="ts">
import InputText from "openvue/inputtext";
import Message from "openvue/message";

import ResourceResultList from "@/arches_geolibre/components/EditResourcesSection/components/ResourceFinder/components/ResourceResultList.vue";
import ResultPager from "@/arches_geolibre/components/EditResourcesSection/components/ResourceFinder/components/ResultPager.vue";

import { useDescribeRequestError } from "@/arches_geolibre/composables/use-describe-request-error.ts";
import { useResourceSearch } from "@/arches_geolibre/composables/use-resource-search.ts";

import type { ResourceResult } from "@/arches_geolibre/components/EditResourcesSection/components/ResourceFinder/types.ts";
import type { ArchesGeometryNode } from "@/arches_geolibre/types.ts";

const props = defineProps<{ node: ArchesGeometryNode; isAdding: boolean }>();

const emit = defineEmits<{
    (event: "add", resources: ResourceResult[]): void;
}>();

const describeRequestError = useDescribeRequestError();
const { text, page, results, hasNextPage, searchError, goToPage } =
    useResourceSearch(() => props.node, { onlyMissingGeometry: false });
</script>

<template>
    <div class="resource-search">
        <InputText
            v-model="text"
            :placeholder="$gettext('Search by name')"
            :aria-label="$gettext('Search resources by name')"
            size="small"
            fluid
        />
        <ResourceResultList
            :results="results"
            :is-adding="isAdding"
            @add="emit('add', $event)"
        />
        <ResultPager
            :page="page"
            :has-next-page="hasNextPage"
            @go-to-page="goToPage"
        />
        <Message
            v-if="searchError"
            severity="error"
            size="small"
        >
            {{ describeRequestError(searchError) }}
        </Message>
    </div>
</template>

<style scoped>
.resource-search {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}
</style>
