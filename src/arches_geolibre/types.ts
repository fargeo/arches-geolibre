import type { Feature, Geometry } from "geojson";

export interface ArchesSession {
    instanceUrl: string;
    clientId: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    username: string;
    /** Edits by anyone else are saved as provisional, pending review. */
    isReviewer: boolean;
}

export interface ArchesGeometryNode {
    nodeid: string;
    name: string;
    graph_id: string;
    nodegroup_id: string;
    resourcemodelname: string;
}

export interface NodeValueResponse {
    tileid: string;
    resourceinstance_id: string;
    nodegroup_id: string;
}

export interface LoadedArchesLayer {
    layerId: string;
    node: ArchesGeometryNode;
    isWritable: boolean;
    baselineFeatures: Feature<Geometry | null>[];
}
