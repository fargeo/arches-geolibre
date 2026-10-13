import type { Feature, Geometry } from "geojson";

export interface ArchesSession {
    instanceUrl: string;
    clientId: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    userId: number;
    username: string;
    /** Edits by anyone else are saved as provisional, pending review. */
    isReviewer: boolean;
}

/** The map styling Arches keeps in a geometry node's config. */
export interface ArchesNodeMapStyle {
    fillColor?: string;
    lineColor?: string;
    pointColor?: string;
    outlineColor?: string;
    weight?: number;
    radius?: number;
}

export interface ArchesGeometryNode {
    nodeid: string;
    name: string;
    graph_id: string;
    nodegroup_id: string;
    resourcemodelname: string;
    config?: ArchesNodeMapStyle;
}

export interface ArchesSpatialView {
    spatialviewid: string;
    slug: string;
    description: string;
    geometrynodeid: string;
    isactive: boolean;
}

export interface NodeValueResponse {
    tileid: string;
    resourceinstance_id: string;
    nodegroup_id: string;
}

export type ArchesLayerSource =
    | { kind: "node" }
    | { kind: "spatial-view"; spatialViewId: string; slug: string }
    | { kind: "worklist"; resourceInstanceIds: string[] };

export interface LoadedArchesLayer {
    /** Stays the same when the GeoLibre layer is replaced, unlike layerId. */
    key: string;
    layerId: string;
    node: ArchesGeometryNode;
    source: ArchesLayerSource;
    isWritable: boolean;
    baselineFeatures: Feature<Geometry | null>[];
    /** Bumped when the plugin changes the layer's features itself. */
    contentRevision: number;
}
