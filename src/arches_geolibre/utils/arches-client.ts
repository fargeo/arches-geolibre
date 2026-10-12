import type { FeatureCollection, Geometry } from "geojson";

import type {
    ArchesGeometryNode,
    ArchesSession,
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

export async function fetchNodeFeatures(
    fetchImplementation: typeof fetch,
    session: ArchesSession,
    nodeId: string,
    resourceInstanceIds: string[] = [],
): Promise<FeatureCollection<Geometry>> {
    const query = new URLSearchParams({
        nodeid: nodeId,
        include_primary_name: "true",
    });
    if (resourceInstanceIds.length > 0) {
        query.set("resourceid", resourceInstanceIds.join(","));
    }
    const response = await authorizedFetch(
        fetchImplementation,
        session,
        `/geojson?${query}`,
    );
    await assertOk(response, "Could not load features");
    return (await response.json()) as FeatureCollection<Geometry>;
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
        username: string;
        is_reviewer: boolean;
    };
    return {
        ...session,
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
        username: "",
        isReviewer: false,
    };
}
