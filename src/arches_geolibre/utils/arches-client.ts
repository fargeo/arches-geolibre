import type { Feature, FeatureCollection, Geometry } from "geojson";

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

/**
 * /geojson failed inside Arches. Arches 8.2 without archesproject/arches#13011
 * fails on every /geojson request, so that's the likely cause.
 */
export class GeoJsonUnavailableError extends ArchesRequestError {
    constructor(status: number) {
        super(`Arches couldn't return geometry (HTTP ${status})`, status);
        this.name = "GeoJsonUnavailableError";
    }
}

export function normalizeInstanceUrl(instanceUrl: string): string {
    return instanceUrl.trim().replace(/\/+$/, "");
}

/**
 * Signs in with the OAuth2 password grant, the flow the QGIS and ArcGIS Pro
 * add-ins use. Browser sign-in (utils/device-sign-in.ts) is preferred where
 * the instance offers it.
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

    return sessionFromTokens(
        fetchImplementation,
        normalizedInstanceUrl,
        clientId,
        await tokenResponse.json(),
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
 * A geometry node's features through /geojson, in a single request.
 * Requires archesproject/arches#13011 (docs/arches-compatibility.md), which
 * fixes the endpoint, reports each feature's stored id as `featureid`, and
 * makes `include_primary_name` work without one query per feature.
 */
export async function fetchNodeFeatures(
    fetchImplementation: typeof fetch,
    session: ArchesSession,
    nodeId: string,
    options: {
        resourceInstanceIds?: string[];
        signal?: AbortSignal;
        onBytesReceived?: (byteCount: number) => void;
    } = {},
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
    if (response.status >= 500) {
        throw new GeoJsonUnavailableError(response.status);
    }
    await assertOk(response, "Could not load features");
    if (!options.onBytesReceived || !response.body) {
        return (await response.json()) as FeatureCollection<Geometry>;
    }
    return JSON.parse(
        await readTextWithProgress(response.body, options.onBytesReceived),
    ) as FeatureCollection<Geometry>;
}

async function readTextWithProgress(
    body: ReadableStream<Uint8Array>,
    onBytesReceived: (byteCount: number) => void,
): Promise<string> {
    const decoder = new TextDecoder();
    const reader = body.getReader();
    let text = "";
    let byteCount = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) {
            return text + decoder.decode();
        }
        byteCount += value.byteLength;
        onBytesReceived(byteCount);
        text += decoder.decode(value, { stream: true });
    }
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
 * Deletes a tile through /api/tiles/<id> (archesproject/arches#13013).
 * Returns false when Arches refuses: only reviewers may delete a tile that
 * holds approved data, so the caller falls back to clearing it.
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

/**
 * A tile of the resource that has room for this node's geometry but none
 * yet: one in the node's nodegroup whose value is empty, as left when
 * geometry is cleared or a card was filled in without it. Adding geometry
 * should fill that tile. Without a tileid, /api/node_value always adds a new
 * tile, leaving the empty one beside it (and a nodegroup that allows only one
 * tile would refuse it).
 */
export async function fetchEmptyGeometryTileId(
    fetchImplementation: typeof fetch,
    session: ArchesSession,
    resourceInstanceId: string,
    node: Pick<ArchesGeometryNode, "nodeid" | "nodegroup_id">,
): Promise<string | null> {
    const response = await authorizedFetch(
        fetchImplementation,
        session,
        `/resources/${resourceInstanceId}?format=arches-json`,
    );
    await assertOk(response, "Could not read the resource");
    const resource = (await response.json()) as {
        tiles: {
            tileid: string;
            nodegroup_id: string;
            data: Record<string, unknown>;
        }[];
    };
    const emptyTile = resource.tiles.find((tile) => {
        if (tile.nodegroup_id !== node.nodegroup_id) {
            return false;
        }
        const value = tile.data[node.nodeid] as
            FeatureCollection<Geometry> | null | undefined;
        return !value || value.features.length === 0;
    });
    return emptyTile?.tileid ?? null;
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
export interface ResourceSearchPage {
    results: ResourceSearchResult[];
    /** Arches' search index stops counting at 10,000. */
    totalCount: number;
    isTotalCapped: boolean;
    hasNextPage: boolean;
}

/**
 * One page of a resource model's resources, optionally matching a name and
 * optionally only those with no geometry in a node: Arches' advanced search
 * treats a missing tile and an empty one alike.
 */
export async function searchResourcePage(
    fetchImplementation: typeof fetch,
    session: ArchesSession,
    options: {
        graphId: string;
        text?: string;
        page?: number;
        missingGeometryNodeId?: string;
        signal?: AbortSignal;
    },
): Promise<ResourceSearchPage> {
    const query = new URLSearchParams({
        "paging-filter": String(options.page ?? 1),
        "resource-type-filter": JSON.stringify([
            { graphid: options.graphId, inverted: false },
        ]),
    });
    const text = options.text?.trim();
    if (text) {
        query.set(
            "term-filter",
            JSON.stringify([
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
        );
    }
    if (options.missingGeometryNodeId) {
        query.set(
            "advanced-search",
            JSON.stringify([
                {
                    op: "and",
                    [options.missingGeometryNodeId]: { op: "null", val: "" },
                },
            ]),
        );
    }
    const response = await authorizedFetch(
        fetchImplementation,
        session,
        `/search/resources?${query}`,
        { signal: options.signal },
    );
    await assertOk(response, "Could not search Arches");
    const searchResponse = (await response.json()) as {
        results: {
            hits: {
                total: number | { value: number; relation: string };
                hits: {
                    _id: string;
                    _source: {
                        displayname: string | { value: string }[];
                    };
                }[];
            };
        };
        "paging-filter"?: { paginator?: { has_next?: boolean } };
    };
    const { total, hits } = searchResponse.results.hits;
    return {
        results: hits.map((hit) => ({
            resourceInstanceId: hit._id,
            name: readDisplayName(hit._source.displayname),
        })),
        totalCount: typeof total === "number" ? total : total.value,
        isTotalCapped: typeof total !== "number" && total.relation === "gte",
        hasNextPage:
            searchResponse["paging-filter"]?.paginator?.has_next ?? false,
    };
}

export async function searchResources(
    fetchImplementation: typeof fetch,
    session: ArchesSession,
    graphId: string,
    text: string,
    signal?: AbortSignal,
): Promise<ResourceSearchResult[]> {
    const searchPage = await searchResourcePage(fetchImplementation, session, {
        graphId,
        text,
        signal,
    });
    return searchPage.results;
}

/**
 * Each resource's features in a node. A resource missing from the result has
 * no geometry there that the user can see.
 */
export async function fetchGeometryByResource(
    fetchImplementation: typeof fetch,
    session: ArchesSession,
    nodeId: string,
    resourceInstanceIds: string[],
): Promise<Map<string, Feature<Geometry>[]>> {
    const featuresByResource = new Map<string, Feature<Geometry>[]>();
    if (resourceInstanceIds.length === 0) {
        return featuresByResource;
    }
    const featureCollection = await fetchNodeFeatures(
        fetchImplementation,
        session,
        nodeId,
        { resourceInstanceIds },
    );
    for (const feature of featureCollection.features) {
        const resourceInstanceId = feature.properties?.resourceinstanceid;
        if (typeof resourceInstanceId !== "string") {
            continue;
        }
        featuresByResource.set(resourceInstanceId, [
            ...(featuresByResource.get(resourceInstanceId) ?? []),
            feature,
        ]);
    }
    return featuresByResource;
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

export async function sessionFromTokens(
    fetchImplementation: typeof fetch,
    instanceUrl: string,
    clientId: string,
    tokenPayload: TokenPayload,
): Promise<ArchesSession> {
    return withUserProfile(
        fetchImplementation,
        toSession(instanceUrl, clientId, tokenPayload),
    );
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

interface TokenPayload {
    access_token: string;
    refresh_token: string;
    expires_in: number;
}

function toSession(
    instanceUrl: string,
    clientId: string,
    tokenPayload: TokenPayload,
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
