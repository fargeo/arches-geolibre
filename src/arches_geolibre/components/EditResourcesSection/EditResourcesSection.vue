<script setup lang="ts">
import { ref } from "vue";

import Button from "openvue/button";
import Message from "openvue/message";

import CurrentResource from "@/arches_geolibre/components/EditResourcesSection/components/CurrentResource.vue";
import NodePicker from "@/arches_geolibre/components/EditResourcesSection/components/NodePicker.vue";
import ResourceFinder from "@/arches_geolibre/components/EditResourcesSection/components/ResourceFinder/ResourceFinder.vue";
import WorklistEntries from "@/arches_geolibre/components/EditResourcesSection/components/WorklistEntries.vue";

import { useDescribeRequestError } from "@/arches_geolibre/composables/use-describe-request-error.ts";
import { useWorklist } from "@/arches_geolibre/composables/use-worklist.ts";

import type { ArchesGeometryNode } from "@/arches_geolibre/types.ts";

const { worklist, resourceIdsWithPendingChanges, start, finish } =
    useWorklist();
const describeRequestError = useDescribeRequestError();

const isStarting = ref(false);
const errorMessage = ref("");

async function startWorklist(node: ArchesGeometryNode): Promise<void> {
    isStarting.value = true;
    errorMessage.value = "";
    try {
        await start(node);
    } catch (error) {
        errorMessage.value = describeRequestError(error);
    } finally {
        isStarting.value = false;
    }
}
</script>

<template>
    <section class="edit-resources-section">
        <h3>{{ $gettext("Edit resources") }}</h3>
        <template v-if="!worklist">
            <small>
                {{
                    $gettext(
                        "Pick resources and give them geometry, or edit what they have, including resources with no geometry yet.",
                    )
                }}
            </small>
            <NodePicker
                :is-starting="isStarting"
                @start="startWorklist"
            />
        </template>
        <template v-else>
            <div class="worklist-heading">
                <strong>
                    {{
                        `${worklist.node.resourcemodelname}: ${worklist.node.name}`
                    }}
                </strong>
                <Button
                    :label="$gettext('Finish')"
                    :disabled="resourceIdsWithPendingChanges.size > 0"
                    :title="
                        resourceIdsWithPendingChanges.size > 0
                            ? $gettext(
                                  'Push or untick the pending changes first.',
                              )
                            : undefined
                    "
                    size="small"
                    severity="secondary"
                    text
                    @click="finish"
                />
            </div>
            <ResourceFinder :node="worklist.node" />
            <WorklistEntries v-if="worklist.entries.length > 0" />
            <CurrentResource v-if="worklist.currentResourceId" />
        </template>
        <Message
            v-if="errorMessage"
            severity="error"
            size="small"
        >
            {{ errorMessage }}
        </Message>
    </section>
</template>

<style scoped>
.edit-resources-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

h3 {
    margin: 0;
    font-size: 1rem;
}

.worklist-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
}
</style>
