import type { ArchesSession } from "@/arches_geolibre/types.ts";

/** The resource editor for those who may edit the resource, else its report. */
export function resourceUrl(
    session: ArchesSession,
    resourceInstanceId: string,
    canEdit: boolean,
): string {
    const page = canEdit ? "resource" : "report";
    return `${session.instanceUrl}/${page}/${resourceInstanceId}`;
}
