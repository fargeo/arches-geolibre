import { groupNodesByResourceModel } from "@/arches_geolibre/utils/catalog.ts";

import type { ArchesGeometryNode } from "@/arches_geolibre/types.ts";

function geometryNode(
    graphId: string,
    resourceModelName: string,
    name: string,
): ArchesGeometryNode {
    return {
        nodeid: `${graphId}-${name}`,
        name,
        graph_id: graphId,
        nodegroup_id: `${graphId}-${name}`,
        resourcemodelname: resourceModelName,
    };
}

describe("groupNodesByResourceModel", () => {
    it("groups and sorts nodes by resource model, hiding system settings", () => {
        const groups = groupNodesByResourceModel([
            geometryNode("monuments", "Monument", "Location"),
            geometryNode(
                "ff623370-fa12-11e6-b98b-6c4008b05c4c",
                "Arches System Settings",
                "DEFAULT_BOUNDS",
            ),
            geometryNode("areas", "Area", "Boundary"),
            geometryNode("monuments", "Monument", "Extent"),
        ]);

        expect(
            groups.map((group) => [
                group.resourceModelName,
                group.nodes.map((node) => node.name),
            ]),
        ).toEqual([
            ["Area", ["Boundary"]],
            ["Monument", ["Extent", "Location"]],
        ]);
    });
});
