import {
    addOverviewLayer,
    canAddOverviewLayers,
    syncOverviewHeaders,
} from "@/arches_geolibre/utils/overview-layers.ts";

import type { GeoLibreAppAPI } from "@/arches_geolibre/geolibre/host-api.ts";
import type {
    ArchesGeometryNode,
    ArchesSession,
} from "@/arches_geolibre/types.ts";
import type { OverviewLayer } from "@/arches_geolibre/utils/overview-layers.ts";

const INSTANCE_URL = "https://arches.example.org";

const NODE: ArchesGeometryNode = {
    nodeid: "location",
    name: "Location",
    graph_id: "graph",
    nodegroup_id: "location",
    resourcemodelname: "Heritage Asset",
};

function session(
    accessToken: string,
    instanceUrl = INSTANCE_URL,
): ArchesSession {
    return {
        instanceUrl,
        clientId: "client",
        accessToken,
        refreshToken: "refresh",
        expiresAt: Date.now() + 3_600_000,
        userId: 1,
        username: "editor",
        isReviewer: false,
    };
}

/** A GeoLibre host with opengeos/GeoLibre#3140 and #3142. */
function hostWithTileHeaders(layerIds: string[] = ["overview-layer"]) {
    return {
        addGeoJsonLayer: vi.fn(),
        addVectorTileLayer: vi.fn(() => "overview-layer"),
        setLayerRequestHeaders: vi.fn(() => true),
        importLayerStyle: vi.fn(() => ({ ok: true, warnings: [] })),
        getLayers: vi.fn(() => layerIds),
    };
}

function overviewLayer(
    layerId: string,
    instanceUrl = INSTANCE_URL,
): OverviewLayer {
    return { layerId, instanceUrl, node: NODE };
}

describe("canAddOverviewLayers", () => {
    it("needs vector tile layers and tile request headers", () => {
        const host = hostWithTileHeaders();
        expect(canAddOverviewLayers(host as unknown as GeoLibreAppAPI)).toBe(
            true,
        );

        const { setLayerRequestHeaders: _headers, ...withoutHeaders } = host;
        expect(
            canAddOverviewLayers(withoutHeaders as unknown as GeoLibreAppAPI),
        ).toBe(false);
    });
});

describe("addOverviewLayer", () => {
    it("adds the node's tiles with the session's token, styled as Arches styles it", () => {
        const host = hostWithTileHeaders();

        const added = addOverviewLayer(
            host as unknown as GeoLibreAppAPI,
            session("token"),
            NODE,
        );

        expect(host.addVectorTileLayer).toHaveBeenCalledWith(
            "Heritage Asset: Location (overview)",
            `${INSTANCE_URL}/mvt/location/{z}/{x}/{y}.pbf`,
            {
                sourceLayers: ["location"],
                headers: { Authorization: "Bearer token" },
            },
        );
        expect(host.importLayerStyle).toHaveBeenCalledWith(
            "overview-layer",
            expect.any(String),
        );
        expect(added).toEqual(overviewLayer("overview-layer"));
    });
});

describe("syncOverviewHeaders", () => {
    it("gives each layer the current token, or none when signed out", () => {
        const host = hostWithTileHeaders(["first", "second"]);
        const layers = [overviewLayer("first"), overviewLayer("second")];

        syncOverviewHeaders(
            host as unknown as GeoLibreAppAPI,
            layers,
            session("new"),
        );
        syncOverviewHeaders(host as unknown as GeoLibreAppAPI, layers, null);

        expect(host.setLayerRequestHeaders.mock.calls).toEqual([
            ["first", { Authorization: "Bearer new" }],
            ["second", { Authorization: "Bearer new" }],
            ["first", null],
            ["second", null],
        ]);
    });

    it("keeps a token from another instance's layers", () => {
        const host = hostWithTileHeaders(["elsewhere"]);

        syncOverviewHeaders(
            host as unknown as GeoLibreAppAPI,
            [overviewLayer("elsewhere", "https://other.example.org")],
            session("token"),
        );

        expect(host.setLayerRequestHeaders).toHaveBeenCalledWith(
            "elsewhere",
            null,
        );
    });

    it("drops layers the user removed in GeoLibre", () => {
        const host = hostWithTileHeaders(["kept"]);

        const remaining = syncOverviewHeaders(
            host as unknown as GeoLibreAppAPI,
            [overviewLayer("kept"), overviewLayer("removed")],
            session("token"),
        );

        expect(remaining).toEqual([overviewLayer("kept")]);
        expect(host.setLayerRequestHeaders).toHaveBeenCalledTimes(1);
    });

    it("carries on past a layer GeoLibre refuses headers for", () => {
        const host = hostWithTileHeaders(["refused", "fine"]);
        host.setLayerRequestHeaders.mockImplementationOnce(() => {
            throw new Error("unscoped");
        });
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        syncOverviewHeaders(
            host as unknown as GeoLibreAppAPI,
            [overviewLayer("refused"), overviewLayer("fine")],
            session("token"),
        );

        expect(host.setLayerRequestHeaders).toHaveBeenCalledTimes(2);
        warn.mockRestore();
    });
});
