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

/**
 * Wraps fetch so authorized requests to the signed-in instance always carry
 * a current token, refreshing it shortly before it expires. Arches doesn't
 * reject an expired token with 401: it treats the request as the anonymous
 * user, so reads quietly return less. Refreshing ahead of expiry avoids that.
 */
export function createRefreshingFetch(
    baseFetch: typeof fetch,
    sessionStore: SessionStore,
): typeof fetch {
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

    return async (input, init) => {
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
}
