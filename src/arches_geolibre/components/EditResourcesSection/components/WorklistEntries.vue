<script setup lang="ts">
import { useGettext } from "vue3-gettext";

import Button from "openvue/button";
import Tag from "openvue/tag";

import { useArchesWorkspace } from "@/arches_geolibre/composables/use-arches-workspace.ts";
import { useWorklist } from "@/arches_geolibre/composables/use-worklist.ts";
import {
    removeFromWorklist,
    setCurrent,
} from "@/arches_geolibre/utils/worklist.ts";

import type { WorklistEntry } from "@/arches_geolibre/utils/worklist.ts";

const workspace = useArchesWorkspace();
const { worklist, resourceIdsWithPendingChanges } = useWorklist();
const { $gettext } = useGettext();

function describeStatus(entry: WorklistEntry): {
    label: string;
    severity: "success" | "info" | "warn" | "secondary" | "danger";
} {
    if (entry.canEdit === false) {
        return { label: $gettext("Can't edit"), severity: "danger" };
    }
    if (resourceIdsWithPendingChanges.value.has(entry.resourceInstanceId)) {
        return { label: $gettext("Ready to push"), severity: "info" };
    }
    if (entry.status === "pushed") {
        return workspace.session?.isReviewer
            ? { label: $gettext("Saved"), severity: "success" }
            : { label: $gettext("Awaiting review"), severity: "warn" };
    }
    if (entry.status === "skipped") {
        return { label: $gettext("Skipped"), severity: "secondary" };
    }
    return entry.hasGeometry
        ? { label: $gettext("Has geometry"), severity: "secondary" }
        : { label: $gettext("No geometry"), severity: "warn" };
}

function makeCurrent(entry: WorklistEntry): void {
    if (workspace.worklist) {
        workspace.worklist = setCurrent(
            workspace.worklist,
            entry.resourceInstanceId,
        );
    }
}

function remove(entry: WorklistEntry): void {
    if (workspace.worklist) {
        workspace.worklist = removeFromWorklist(
            workspace.worklist,
            entry.resourceInstanceId,
        );
    }
}
</script>

<template>
    <div
        v-if="worklist"
        class="worklist-entries"
    >
        <strong>
            {{
                $gettext("Worklist (%{count})", {
                    count: worklist.entries.length,
                })
            }}
        </strong>
        <ol>
            <li
                v-for="entry in worklist.entries"
                :key="entry.resourceInstanceId"
                :class="{
                    current:
                        entry.resourceInstanceId === worklist.currentResourceId,
                }"
            >
                <Button
                    class="entry-name"
                    :label="entry.name || $gettext('Unnamed resource')"
                    :aria-current="
                        entry.resourceInstanceId === worklist.currentResourceId
                    "
                    size="small"
                    text
                    @click="makeCurrent(entry)"
                />
                <Tag
                    :value="describeStatus(entry).label"
                    :severity="describeStatus(entry).severity"
                />
                <Button
                    label="✕"
                    :aria-label="
                        $gettext('Remove %{name} from the worklist', {
                            name: entry.name,
                        })
                    "
                    size="small"
                    severity="secondary"
                    text
                    @click="remove(entry)"
                />
            </li>
        </ol>
    </div>
</template>

<style scoped>
.worklist-entries {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}

ol {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    max-height: 14rem;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
}

li {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    border-inline-start: 0.1875rem solid transparent;
    padding-inline-start: 0.25rem;
}

li.current {
    border-inline-start-color: var(--arches-geolibre-primary-color);
    background: var(--arches-geolibre-highlight-background);
}

.entry-name {
    flex: 1;
    justify-content: flex-start;
    overflow: hidden;
    white-space: nowrap;
}
</style>
