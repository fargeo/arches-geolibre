import { createSessionRefresher } from "@/arches_geolibre/utils/session-refresh.ts";

import type { ArchesSession } from "@/arches_geolibre/types.ts";

const INSTANCE_URL = "https://arches.example.org";

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status });
}

function makeSession(expiresInMilliseconds: number): ArchesSession {
    return {
        instanceUrl: INSTANCE_URL,
        clientId: "client",
        accessToken: "old-token",
        refreshToken: "refresh-token",
        expiresAt: Date.now() + expiresInMilliseconds,
        userId: 7,
        username: "editor",
        isReviewer: true,
    };
}

function fakeArches({ refreshSucceeds = true } = {}) {
    const sentTokens: string[] = [];
    const baseFetch = vi.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url.endsWith("/o/token/")) {
                return refreshSucceeds
                    ? jsonResponse({
                          access_token: "new-token",
                          refresh_token: "new-refresh-token",
                          expires_in: 3600,
                      })
                    : jsonResponse({ error: "invalid_grant" }, 400);
            }
            if (url.endsWith("/auth/user_profile")) {
                return jsonResponse({
                    id: 7,
                    username: "editor",
                    is_reviewer: true,
                });
            }
            sentTokens.push(
                new Headers(init?.headers).get("Authorization") ?? "",
            );
            return jsonResponse({});
        },
    );
    return { baseFetch, sentTokens };
}

function makeStore(session: ArchesSession | null) {
    const store = {
        session,
        expired: false,
        current: () => store.session,
        replace: (refreshedSession: ArchesSession) => {
            store.session = refreshedSession;
        },
        expire: () => {
            store.expired = true;
            store.session = null;
        },
    };
    return store;
}

const authorized = { headers: { Authorization: "Bearer old-token" } };

describe("createSessionRefresher", () => {
    it("sends requests unchanged while the token is current", async () => {
        const { baseFetch, sentTokens } = fakeArches();
        const store = makeStore(makeSession(3_600_000));

        await createSessionRefresher(baseFetch, store).fetch(
            `${INSTANCE_URL}/api/tiles/1`,
            authorized,
        );

        expect(sentTokens).toEqual(["Bearer old-token"]);
        expect(store.session?.accessToken).toBe("old-token");
    });

    it("refreshes once for concurrent requests near expiry", async () => {
        const { baseFetch, sentTokens } = fakeArches();
        const store = makeStore(makeSession(10_000));
        const archesFetch = createSessionRefresher(baseFetch, store).fetch;

        await Promise.all([
            archesFetch(`${INSTANCE_URL}/api/tiles/1`, authorized),
            archesFetch(`${INSTANCE_URL}/api/tiles/2`, authorized),
        ]);

        expect(sentTokens).toEqual(["Bearer new-token", "Bearer new-token"]);
        expect(
            baseFetch.mock.calls.filter(([url]) =>
                String(url).endsWith("/o/token/"),
            ),
        ).toHaveLength(1);
        expect(store.session?.refreshToken).toBe("new-refresh-token");
    });

    it("leaves unauthenticated and other-site requests alone", async () => {
        const { baseFetch } = fakeArches();
        const store = makeStore(makeSession(10_000));
        const archesFetch = createSessionRefresher(baseFetch, store).fetch;

        await archesFetch(`${INSTANCE_URL}/auth/device_client_id`);
        await archesFetch("https://elsewhere.example.org/api", authorized);

        expect(baseFetch).toHaveBeenCalledTimes(2);
        expect(store.session?.accessToken).toBe("old-token");
    });

    it("ends the session when Arches refuses the refresh", async () => {
        const { baseFetch, sentTokens } = fakeArches({
            refreshSucceeds: false,
        });
        const store = makeStore(makeSession(10_000));

        await expect(
            createSessionRefresher(baseFetch, store).fetch(
                `${INSTANCE_URL}/api/tiles/1`,
                authorized,
            ),
        ).rejects.toThrow();

        expect(store.expired).toBe(true);
        expect(sentTokens).toEqual([]);
    });

    it("refreshes a token about to expire for requests it doesn't make", async () => {
        const { baseFetch } = fakeArches();
        const freshStore = makeStore(makeSession(3_600_000));
        await createSessionRefresher(baseFetch, freshStore).refreshIfDue();
        expect(baseFetch).not.toHaveBeenCalled();

        const expiringStore = makeStore(makeSession(10_000));
        await createSessionRefresher(baseFetch, expiringStore).refreshIfDue();
        expect(expiringStore.session?.refreshToken).toBe("new-refresh-token");
    });

    it("ends the session quietly when a refresh for tiles is refused", async () => {
        const { baseFetch } = fakeArches({ refreshSucceeds: false });
        const store = makeStore(makeSession(10_000));

        await createSessionRefresher(baseFetch, store).refreshIfDue();

        expect(store.expired).toBe(true);
    });
});
