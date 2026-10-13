export interface ResourceResult {
    resourceInstanceId: string;
    name: string;
    /** Null while it's still being checked. */
    hasGeometry: boolean | null;
}
