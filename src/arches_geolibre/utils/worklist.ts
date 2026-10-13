import type { ArchesGeometryNode } from "@/arches_geolibre/types.ts";
import type { ChangeTarget } from "@/arches_geolibre/utils/push-plan.ts";

/**
 * Resources picked for editing one at a time, whether or not they have
 * geometry yet: the resource-first workflow that spatial-view based tools
 * can't offer, because a resource with no geometry never appears in a view.
 */
export interface Worklist {
    node: ArchesGeometryNode;
    entries: WorklistEntry[];
    currentResourceId: string | null;
    /** The key of the loaded layer holding the entries' geometry. */
    layerKey: string | null;
}

export interface WorklistEntry {
    resourceInstanceId: string;
    name: string;
    hasGeometry: boolean;
    /** Unknown until Arches has been asked. */
    canEdit: boolean | null;
    status: "to-do" | "skipped" | "pushed";
}

export interface WorklistCandidate {
    resourceInstanceId: string;
    name: string;
    hasGeometry: boolean;
}

export function createWorklist(node: ArchesGeometryNode): Worklist {
    return { node, entries: [], currentResourceId: null, layerKey: null };
}

/** Adds resources not already in the worklist, keeping their order. */
export function addToWorklist(
    worklist: Worklist,
    candidates: WorklistCandidate[],
): Worklist {
    const knownResourceIds = new Set(
        worklist.entries.map((entry) => entry.resourceInstanceId),
    );
    const newEntries: WorklistEntry[] = [];
    for (const candidate of candidates) {
        if (knownResourceIds.has(candidate.resourceInstanceId)) {
            continue;
        }
        knownResourceIds.add(candidate.resourceInstanceId);
        newEntries.push({ ...candidate, canEdit: null, status: "to-do" });
    }
    const entries = [...worklist.entries, ...newEntries];
    return {
        ...worklist,
        entries,
        currentResourceId:
            worklist.currentResourceId ??
            firstToDo(entries)?.resourceInstanceId ??
            null,
    };
}

export function removeFromWorklist(
    worklist: Worklist,
    resourceInstanceId: string,
): Worklist {
    const entries = worklist.entries.filter(
        (entry) => entry.resourceInstanceId !== resourceInstanceId,
    );
    const currentResourceId =
        worklist.currentResourceId === resourceInstanceId
            ? (nextToDoAfter(worklist.entries, resourceInstanceId, entries)
                  ?.resourceInstanceId ?? null)
            : worklist.currentResourceId;
    return { ...worklist, entries, currentResourceId };
}

export function setCurrent(
    worklist: Worklist,
    resourceInstanceId: string,
): Worklist {
    return worklist.entries.some(
        (entry) => entry.resourceInstanceId === resourceInstanceId,
    )
        ? { ...worklist, currentResourceId: resourceInstanceId }
        : worklist;
}

/** Moves to the next resource still to do, wrapping round to earlier ones. */
export function moveToNext(worklist: Worklist): Worklist {
    if (!worklist.currentResourceId) {
        return {
            ...worklist,
            currentResourceId:
                firstToDo(worklist.entries)?.resourceInstanceId ?? null,
        };
    }
    const nextEntry = nextToDoAfter(
        worklist.entries,
        worklist.currentResourceId,
        worklist.entries,
    );
    return {
        ...worklist,
        currentResourceId:
            nextEntry?.resourceInstanceId ?? worklist.currentResourceId,
    };
}

/** Leaves the current resource for later and moves on. */
export function skipCurrent(worklist: Worklist): Worklist {
    const currentResourceId = worklist.currentResourceId;
    if (!currentResourceId) {
        return worklist;
    }
    return moveToNext(
        updateEntries(worklist, [currentResourceId], { status: "skipped" }),
    );
}

export function updateEntries(
    worklist: Worklist,
    resourceInstanceIds: string[],
    update: Partial<Pick<WorklistEntry, "hasGeometry" | "canEdit" | "status">>,
): Worklist {
    const updatedIds = new Set(resourceInstanceIds);
    return {
        ...worklist,
        entries: worklist.entries.map((entry) =>
            updatedIds.has(entry.resourceInstanceId)
                ? { ...entry, ...update }
                : entry,
        ),
    };
}

export function currentEntry(worklist: Worklist): WorklistEntry | null {
    return (
        worklist.entries.find(
            (entry) => entry.resourceInstanceId === worklist.currentResourceId,
        ) ?? null
    );
}

/** Where new geometry goes while working through the list. */
export function currentTarget(worklist: Worklist): ChangeTarget | null {
    const entry = currentEntry(worklist);
    return entry
        ? {
              kind: "existing-resource",
              resourceInstanceId: entry.resourceInstanceId,
              name: entry.name,
          }
        : null;
}

function firstToDo(entries: WorklistEntry[]): WorklistEntry | undefined {
    return entries.find((entry) => entry.status === "to-do");
}

function nextToDoAfter(
    orderedEntries: WorklistEntry[],
    resourceInstanceId: string,
    remainingEntries: WorklistEntry[],
): WorklistEntry | undefined {
    const remainingIds = new Set(
        remainingEntries.map((entry) => entry.resourceInstanceId),
    );
    const startIndex = orderedEntries.findIndex(
        (entry) => entry.resourceInstanceId === resourceInstanceId,
    );
    const rotated = [
        ...orderedEntries.slice(startIndex + 1),
        ...orderedEntries.slice(0, startIndex),
    ];
    return rotated.find(
        (entry) =>
            entry.status === "to-do" &&
            remainingIds.has(entry.resourceInstanceId),
    );
}
