import type { FeatureCollection, Geometry } from "geojson";

import type {
    ArchesGeometryNode,
    ArchesSession,
    ArchesSpatialView,
    NodeValueResponse,
} from "@/arches_geolibre/types.ts";

const GEOMETRY_DATATYPE = "geojson-feature-collection";
const TOKEN_REFRESH_MARGIN_MILLISECONDS = 60_000;

export class ArchesRequestError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
        this.name = "ArchesRequestError";
    }
}

export function normalizeInstanceUrl(instanceUrl: string): string {
    return instanceUrl.trim().replace(/\/+$/, "");
}

/**
 * Signs in with the OAuth2 password grant, the flow the QGIS and ArcGIS Pro
 * add-ins use. Arches 8.1 ships django-oauth-toolkit 3.0.1, which predates
 * the device authorization grant, so this is the only grant available there.
 */
export async function signInWithPassword(
    fetchImplementation: typeof fetch,
    instanceUrl: string,
    username: string,
    password: string,
): Promise<ArchesSession> {
    const normalizedInstanceUrl = normalizeInstanceUrl(instanceUrl);

    const clientIdResponse = await fetchImplementation(
        `${normalizedInstanceUrl}/auth/get_client_id`,
        {
            method: "POST",
            body: new URLSearchParams({ username, password }),
        },
    );
    await assertOk(clientIdResponse, "Could not get the OAuth client id");
    const { clientid: clientId } = (await clientIdResponse.json()) as {
        clientid: string;
    };

    const tokenResponse = await fetchImplementation(
        `${normalizedInstanceUrl}/o/token/`,
        {
            method: "POST",
            body: new URLSearchParams({
                grant_type: "password",
                client_id: clientId,
                username,
                password,
            }),
        },
    );
    await assertOk(tokenResponse, "Sign-in failed");

    return withUserProfile(
        fetchImplementation,
        toSession(normalizedInstanceUrl, clientId, await tokenResponse.json()),
    );
}

export async function refreshSession(
    fetchImplementation: typeof fetch,
    session: ArchesSession,
): Promise<ArchesSession> {
    const tokenResponse = await fetchImplementation(
        `${session.instanceUrl}/o/token/`,
        {
            method: "POST",
            body: new URLSearchParams({
                grant_type: "refresh_token",
                client_id: session.clientId,
                refresh_token: session.refreshToken,
            }),
        },
    );
    await assertOk(tokenResponse, "Session refresh failed");

    return withUserProfile(
        fetchImplementation,
        toSession(
            session.instanceUrl,
            session.clientId,
            await tokenResponse.json(),
        ),
    );
}

export function sessionNeedsRefresh(session: ArchesSession): boolean {
    return session.expiresAt - Date.now() < TOKEN_REFRESH_MARGIN_MILLISECONDS;
}

export async function fetchGeometryNodes(
    fetchImplementation: typeof fetch,
    session: ArchesSession,
    permission: "read_nodegroup" | "write_nodegroup",
): Promise<ArchesGeometryNode[]> {
    const query = new URLSearchParams({
        datatype: GEOMETRY_DATATYPE,
        perms: permission,
    });
    const response = await authorizedFetch(
        fetchImplementation,
        session,
        `/api/nodes/?${query}`,
    );
    if (response.status === 404) {
        return [];
    }
    await assertOk(response, "Could not list geometry nodes");
    return (await response.json()) as ArchesGeometryNode[];
}

/**
 * Loads a geometry node's features in a single request. Paging /geojson
 * doesn't help on 8.1: every page re-runs the whole permission filter, which
 * dominates the cost.
 */
export async function fetchNodeFeatures(
    fetchImplementation: typeof fetch,
    session: ArchesSession,
    nodeId: string,
    options: { resourceInstanceIds?: string[]; signal?: AbortSignal } = {},
): Promise<FeatureCollection<Geometry>> {
    const query = new URLSearchParams({
        nodeid: nodeId,
        include_primary_name: "true",
    });
    if (options.resourceInstanceIds?.length) {
        query.set("resourceid", options.resourceInstanceIds.join(","));
    }
    const response = await authorizedFetch(
        fetchImplementation,
        session,
        `/geojson?${query}`,
        { signal: options.signal },
    );
    await assertOk(response, "Could not load features");
    return (await response.json()) as FeatureCollection<Geometry>;
}

export async function fetchSpatialViews(
    fetchImplementation: typeof fetch,
    session: ArchesSession,
): Promise<ArchesSpatialView[]> {
    const response = await authorizedFetch(
        fetchImplementation,
        session,
        "/api/spatialview/",
    );
    await assertOk(response, "Could not list spatial views");
    const spatialViews = (await response.json()) as ArchesSpatialView[];
    return spatialViews.filter((spatialView) => spatialView.isactive);
}

export async function fetchCanEditResource(
    fetchImplementation: typeof fetch,
    session: ArchesSession,
    resourceInstanceId: string,
): Promise<boolean> {
    const query = new URLSearchParams({
        resourceinstanceid: resourceInstanceId,
    });
    const response = await authorizedFetch(
        fetchImplementation,
        session,
        `/api/instance_permissions/?${query}`,
    );
    await assertOk(response, "Could not read the resource's permissions");
    const permissions = (await response.json()) as { edit: boolean };
    return permissions.edit;
}

/**
 * Deletes a tile through /api/tiles/<id>, which Arches 8.1 doesn't support
 * yet (see the Phase 1 core branch). Returns false when the tile couldn't be
 * deleted, so the caller can fall back to clearing it.
 */
export async function deleteTile(
    fetchImplementation: typeof fetch,
    session: ArchesSession,
    tileId: string,
): Promise<boolean> {
    const response = await authorizedFetch(
        fetchImplementation,
        session,
        `/api/tiles/${tileId}`,
        { method: "DELETE" },
    );
    return response.ok;
}

export interface ArchesTile {
    tileid: string;
    resourceinstance_id: string;
    nodegroup_id: string;
    data: Record<string, unknown>;
    provisionaledits: Record<
        string,
        { status: string; value: Record<string, unknown> }
    > | null;
}

/** The tile, or null when it's gone or the user may no longer read it. */
export async function fetchTile(
    fetchImplementation: typeof fetch,
    session: ArchesSession,
    tileId: string,
): Promise<ArchesTile | null> {
    const response = await authorizedFetch(
        fetchImplementation,
        session,
        `/api/tiles/${tileId}`,
    );
    if (response.status === 403 || response.status === 404) {
        return null;
    }
    await assertOk(response, "Could not read the tile");
    return (await response.json()) as ArchesTile;
}

export interface ResourceSearchResult {
    resourceInstanceId: string;
    name: string;
}

/** Resources of one model whose names match `text`, through Arches search. */
export async function searchResources(
    fetchImplementation: typeof fetch,
    session: ArchesSession,
    graphId: string,
    text: string,
    signal?: AbortSignal,
): Promise<ResourceSearchResult[]> {
    const query = new URLSearchParams({
        "paging-filter": "1",
        "term-filter": JSON.stringify([
            {
                inverted: false,
                type: "string",
                context: "",
                context_label: "",
                id: text,
                text,
                value: text,
                selected: true,
            },
        ]),
        "resource-type-filter": JSON.stringify([
            { graphid: graphId, inverted: false },
        ]),
    });
    const response = await authorizedFetch(
        fetchImplementation,
        session,
        `/search/resources?${query}`,
        { signal },
    );
    await assertOk(response, "Could not search Arches");
    const searchResponse = (await response.json()) as {
        results: {
            hits: {
                hits: {
                    _id: string;
                    _source: {
                        displayname: string | { value: string }[];
                    };
                }[];
            };
        };
    };
    return searchResponse.results.hits.hits.map((hit) => ({
        resourceInstanceId: hit._id,
        name: readDisplayName(hit._source.displayname),
    }));
}

function readDisplayName(displayName: string | { value: string }[]): string {
    return typeof displayName === "string"
        ? displayName
        : (displayName[0]?.value ?? "");
}

/**
 * Replaces a tile's whole geometry collection through /api/node_value/.
 * Omitting `tileId` creates a new tile, and omitting `resourceInstanceId` as
 * well creates a new resource holding only this geometry.
 */
export async function saveTileGeometry(
    fetchImplementation: typeof fetch,
    session: ArchesSession,
    request: {
        nodeId: string;
        tileId?: string;
        resourceInstanceId?: string;
        featureCollection: FeatureCollection<Geometry>;
        transactionId: string;
    },
): Promise<NodeValueResponse> {
    const body = new URLSearchParams({
        nodeid: request.nodeId,
        data: JSON.stringify(request.featureCollection),
        transaction_id: request.transactionId,
    });
    if (request.tileId) {
        body.set("tileid", request.tileId);
    }
    if (request.resourceInstanceId) {
        body.set("resourceinstanceid", request.resourceInstanceId);
    }

    const response = await authorizedFetch(
        fetchImplementation,
        session,
        "/api/node_value/",
        { method: "POST", body },
    );
    await assertOk(response, "Could not save the geometry");
    return (await response.json()) as NodeValueResponse;
}

async function authorizedFetch(
    fetchImplementation: typeof fetch,
    session: ArchesSession,
    path: string,
    init: RequestInit = {},
): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${session.accessToken}`);
    return fetchImplementation(`${session.instanceUrl}${path}`, {
        ...init,
        headers,
    });
}

async function assertOk(response: Response, message: string): Promise<void> {
    if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new ArchesRequestError(
            `${message} (HTTP ${response.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
            response.status,
        );
    }
}

async function withUserProfile(
    fetchImplementation: typeof fetch,
    session: ArchesSession,
): Promise<ArchesSession> {
    const response = await authorizedFetch(
        fetchImplementation,
        session,
        "/auth/user_profile",
        { method: "POST" },
    );
    await assertOk(response, "Could not read the user profile");
    const userProfile = (await response.json()) as {
        id: number;
        username: string;
        is_reviewer: boolean;
    };
    return {
        ...session,
        userId: userProfile.id,
        username: userProfile.username,
        isReviewer: userProfile.is_reviewer,
    };
}

function toSession(
    instanceUrl: string,
    clientId: string,
    tokenPayload: {
        access_token: string;
        refresh_token: string;
        expires_in: number;
    },
): ArchesSession {
    return {
        instanceUrl,
        clientId,
        accessToken: tokenPayload.access_token,
        refreshToken: tokenPayload.refresh_token,
        expiresAt: Date.now() + tokenPayload.expires_in * 1000,
        userId: 0,
        username: "",
        isReviewer: false,
    };
}
