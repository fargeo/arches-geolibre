import type { ArchesGeometryNode } from "@/arches_geolibre/types.ts";

// Arches' own system-settings model carries a DEFAULT_BOUNDS geometry node.
const SYSTEM_SETTINGS_GRAPH_ID = "ff623370-fa12-11e6-b98b-6c4008b05c4c";

export interface ResourceModelGroup {
    graphId: string;
    resourceModelName: string;
    nodes: ArchesGeometryNode[];
}

export function groupNodesByResourceModel(
    nodes: ArchesGeometryNode[],
): ResourceModelGroup[] {
    const groupsByGraphId = new Map<string, ResourceModelGroup>();
    for (const node of nodes) {
        if (node.graph_id === SYSTEM_SETTINGS_GRAPH_ID) {
            continue;
        }
        const group = groupsByGraphId.get(node.graph_id) ?? {
            graphId: node.graph_id,
            resourceModelName: node.resourcemodelname,
            nodes: [],
        };
        group.nodes.push(node);
        groupsByGraphId.set(node.graph_id, group);
    }

    const groups = [...groupsByGraphId.values()];
    for (const group of groups) {
        group.nodes.sort((firstNode, secondNode) =>
            firstNode.name.localeCompare(secondNode.name),
        );
    }
    return groups.sort((firstGroup, secondGroup) =>
        firstGroup.resourceModelName.localeCompare(
            secondGroup.resourceModelName,
        ),
    );
}
