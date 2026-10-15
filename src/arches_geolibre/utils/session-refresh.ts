import {
    refreshSession,
    sessionNeedsRefresh,
} from "@/arches_geolibre/utils/arches-client.ts";

import type { ArchesSession } from "@/arches_geolibre/types.ts";

export interface SessionStore {
    current(): ArchesSession | null;
    replace(session: ArchesSession): void;
    /** The refresh token was refused: the user must sign in again. */
    expire(): void;
}

export interface SessionRefresher {
    /**
     * Fetch whose authorized requests to the signed-in instance always carry
     * a current token.
     */
    fetch: typeof fetch;
    /**
     * Refreshes the token if it's about to expire, for requests that don't go
     * through `fetch`, such as map tiles. Resolves once any refresh is done.
     */
    refreshIfDue(): Promise<void>;
}

/**
 * Keeps the session's token current, refreshing it shortly before it expires.
 * Arches doesn't reject an expired token with 401: it treats the request as
 * the anonymous user, so reads quietly return less. Refreshing ahead of
 * expiry avoids that. Concurrent callers share one refresh.
 */
export function createSessionRefresher(
    baseFetch: typeof fetch,
    sessionStore: SessionStore,
): SessionRefresher {
    let pendingRefresh: Promise<ArchesSession> | null = null;

    function refreshOnce(session: ArchesSession): Promise<ArchesSession> {
        pendingRefresh ??= refreshSession(baseFetch, session)
            .then((refreshedSession) => {
                sessionStore.replace(refreshedSession);
                return refreshedSession;
            })
            .catch((error) => {
                sessionStore.expire();
                throw error;
            })
            .finally(() => {
                pendingRefresh = null;
            });
        return pendingRefresh;
    }

    async function refreshIfDue(): Promise<void> {
        const session = sessionStore.current();
        if (session && sessionNeedsRefresh(session)) {
            await refreshOnce(session).catch(() => undefined);
        }
    }

    const refreshingFetch: typeof fetch = async (input, init) => {
        const session = sessionStore.current();
        const headers = new Headers(init?.headers);
        const isAuthorizedArchesRequest =
            session !== null &&
            typeof input === "string" &&
            input.startsWith(`${session.instanceUrl}/`) &&
            headers.has("Authorization");
        if (!isAuthorizedArchesRequest || !sessionNeedsRefresh(session)) {
            return baseFetch(input, init);
        }
        const refreshedSession = await refreshOnce(session);
        headers.set("Authorization", `Bearer ${refreshedSession.accessToken}`);
        return baseFetch(input, { ...init, headers });
    };

    return { fetch: refreshingFetch, refreshIfDue };
}
