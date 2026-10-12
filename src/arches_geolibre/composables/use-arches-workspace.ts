import { inject } from "vue";

import { WORKSPACE_KEY } from "@/arches_geolibre/constants.ts";

import type { ArchesWorkspace } from "@/arches_geolibre/workspace.ts";

export function useArchesWorkspace(): ArchesWorkspace {
    const workspace = inject(WORKSPACE_KEY);
    if (!workspace) {
        throw new Error("The Arches workspace was not provided.");
    }
    return workspace;
}
