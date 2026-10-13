import {
    addToWorklist,
    createWorklist,
    currentTarget,
    moveToNext,
    removeFromWorklist,
    skipCurrent,
    updateEntries,
} from "@/arches_geolibre/utils/worklist.ts";

import type { ArchesGeometryNode } from "@/arches_geolibre/types.ts";

const LOCATION_NODE: ArchesGeometryNode = {
    nodeid: "location",
    name: "Location",
    graph_id: "graph",
    nodegroup_id: "location",
    resourcemodelname: "Heritage Asset",
};

function candidate(name: string, hasGeometry = false) {
    return { resourceInstanceId: name.toLowerCase(), name, hasGeometry };
}

function worklistOf(...names: string[]) {
    return addToWorklist(
        createWorklist(LOCATION_NODE),
        names.map((name) => candidate(name)),
    );
}

describe("worklist", () => {
    it("adds resources once, in order, starting with the first", () => {
        const worklist = addToWorklist(worklistOf("Tannery", "Brewery"), [
            candidate("Brewery"),
            candidate("Foundry", true),
        ]);

        expect(
            worklist.entries.map((entry) => [entry.name, entry.hasGeometry]),
        ).toEqual([
            ["Tannery", false],
            ["Brewery", false],
            ["Foundry", true],
        ]);
        expect(worklist.currentResourceId).toBe("tannery");
    });

    it("targets new geometry at the current resource", () => {
        expect(currentTarget(worklistOf("Tannery"))).toEqual({
            kind: "existing-resource",
            resourceInstanceId: "tannery",
            name: "Tannery",
        });
        expect(currentTarget(createWorklist(LOCATION_NODE))).toBeNull();
    });

    it("moves to the next resource still to do, wrapping round", () => {
        let worklist = worklistOf("Tannery", "Brewery", "Foundry");
        worklist = updateEntries(worklist, ["brewery"], { status: "pushed" });

        worklist = moveToNext(worklist);
        expect(worklist.currentResourceId).toBe("foundry");
        worklist = moveToNext(worklist);
        expect(worklist.currentResourceId).toBe("tannery");
    });

    it("skips a resource for later", () => {
        const worklist = skipCurrent(worklistOf("Tannery", "Brewery"));

        expect(worklist.currentResourceId).toBe("brewery");
        expect(worklist.entries[0].status).toBe("skipped");
    });

    it("stays put when nothing else is left to do", () => {
        const worklist = updateEntries(
            worklistOf("Tannery", "Brewery"),
            ["brewery"],
            {
                status: "pushed",
            },
        );

        expect(moveToNext(worklist).currentResourceId).toBe("tannery");
    });

    it("moves on when the current resource is removed", () => {
        const worklist = removeFromWorklist(
            worklistOf("Tannery", "Brewery"),
            "tannery",
        );

        expect(worklist.entries).toHaveLength(1);
        expect(worklist.currentResourceId).toBe("brewery");
        expect(
            removeFromWorklist(worklist, "brewery").currentResourceId,
        ).toBeNull();
    });
});
