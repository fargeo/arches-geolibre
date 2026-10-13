<script setup lang="ts">
import { computed, onMounted } from "vue";

import { useGettext } from "vue3-gettext";

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

const { $gettext, $ngettext } = useGettext();
const describeRequestError = useDescribeRequestError();
const {
    text,
    page,
    results,
    totalCount,
    isTotalCapped,
    hasNextPage,
    isSearching,
    searchError,
    search,
    goToPage,
} = useResourceSearch(() => props.node, { onlyMissingGeometry: true });

const countMessage = computed(() =>
    isTotalCapped.value
        ? $gettext("More than %{count} resources have no %{node}.", {
              count: totalCount.value.toLocaleString(),
              node: props.node.name,
          })
        : $ngettext(
              "%{count} resource has no %{node}.",
              "%{count} resources have no %{node}.",
              totalCount.value,
              {
                  count: totalCount.value.toLocaleString(),
                  node: props.node.name,
              },
          ),
);

onMounted(search);
</script>

<template>
    <div class="missing-geometry-list">
        <small v-if="!isSearching || results.length > 0">
            {{ countMessage }}
        </small>
        <InputText
            v-model="text"
            :placeholder="$gettext('Filter by name')"
            :aria-label="$gettext('Filter resources with no geometry by name')"
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
.missing-geometry-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}
</style>
