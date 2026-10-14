import {
    GeoJsonUnavailableError,
    fetchNodeFeatures,
    fetchTile,
} from "@/arches_geolibre/utils/arches-client.ts";

import type { ArchesSession } from "@/arches_geolibre/types.ts";

const SESSION: ArchesSession = {
    instanceUrl: "https://arches.example.org",
    clientId: "client",
    accessToken: "token",
    refreshToken: "refresh",
    expiresAt: Date.now() + 3_600_000,
    userId: 1,
    username: "editor",
    isReviewer: true,
};

describe("fetchNodeFeatures", () => {
    it("reports a failing /geojson as possibly missing archesproject/arches#13011", async () => {
        const failingArches = vi.fn(
            async () => new Response("Server Error", { status: 500 }),
        );

        await expect(
            fetchNodeFeatures(failingArches, SESSION, "location"),
        ).rejects.toBeInstanceOf(GeoJsonUnavailableError);
    });
});

describe("fetchTile", () => {
    it("tells GeoLibre that a missing tile is expected, not an error", async () => {
        const archesWithoutTheTile = vi.fn(
            async (_url: RequestInfo | URL, _init?: RequestInit) =>
                new Response("Not found", { status: 404 }),
        );

        expect(
            await fetchTile(archesWithoutTheTile, SESSION, "tile"),
        ).toBeNull();
        const headers = new Headers(
            archesWithoutTheTile.mock.calls[0][1]?.headers,
        );
        expect(headers.get("x-geolibre-expected-status")).toBe("403,404");
    });
});
