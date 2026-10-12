import {
    applyProjectState,
    createArchesWorkspace,
    toProjectState,
} from "@/arches_geolibre/workspace.ts";

import type { ArchesSession } from "@/arches_geolibre/types.ts";

const SESSION: ArchesSession = {
    instanceUrl: "https://arches.example.org",
    clientId: "client",
    accessToken: "secret-access-token",
    refreshToken: "secret-refresh-token",
    expiresAt: 0,
    userId: 3,
    username: "editor",
    isReviewer: true,
};

const LOCATION_NODE = {
    nodeid: "location",
    name: "Location",
    graph_id: "monument",
    nodegroup_id: "location",
    resourcemodelname: "Monument",
};

describe("project state", () => {
    it("records loaded layers without credentials and restores them", () => {
        const workspace = createArchesWorkspace();
        workspace.session = SESSION;
        workspace.loadedLayers.push({
            layerId: "layer-1",
            node: LOCATION_NODE,
            source: { kind: "node" },
            bounds: [-0.2, 51.4, 0.1, 51.6],
            isWritable: true,
            baselineFeatures: [],
        });

        const projectState = toProjectState(workspace);
        expect(JSON.stringify(projectState)).not.toContain("secret");

        const reopenedWorkspace = createArchesWorkspace();
        expect(applyProjectState(reopenedWorkspace, projectState)).toBe(true);
        expect(reopenedWorkspace.projectInstanceUrl).toBe(SESSION.instanceUrl);
        expect(reopenedWorkspace.savedLayers).toEqual([
            {
                layerId: "layer-1",
                node: LOCATION_NODE,
                source: { kind: "node" },
                bounds: [-0.2, 51.4, 0.1, 51.6],
            },
        ]);
    });

    it("saves nothing before the user connects to Arches", () => {
        expect(toProjectState(createArchesWorkspace())).toBeNull();
    });

    it("rejects state that isn't an Arches project state", () => {
        const workspace = createArchesWorkspace();
        expect(applyProjectState(workspace, { layers: "nope" })).toBe(false);
        expect(workspace.projectInstanceUrl).toBeNull();
    });
});
