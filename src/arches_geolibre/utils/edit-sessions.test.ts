import {
    isLayerBeingEdited,
    watchEditSessionEnds,
} from "@/arches_geolibre/utils/edit-sessions.ts";

import type {
    GeoLibreAppAPI,
    GeoLibreEditSessionChange,
    GeoLibreLayerSummary,
} from "@/arches_geolibre/geolibre/host-api.ts";

function layerSummary(id: string, visible: boolean): GeoLibreLayerSummary {
    return { id, name: id, type: "geojson", visible, opacity: 1 };
}

/** A host with opengeos/GeoLibre#3138's session events. */
function hostWithSessionEvents() {
    let listener: ((change: GeoLibreEditSessionChange) => void) | undefined;
    const unsubscribe = vi.fn();
    const geolibreApp = {
        addGeoJsonLayer: vi.fn(),
        onEditSessionChange: vi.fn(
            (callback: (change: GeoLibreEditSessionChange) => void) => {
                listener = callback;
                return unsubscribe;
            },
        ),
        getEditSessionLayerId: vi.fn(() => "edited"),
    } as unknown as GeoLibreAppAPI;
    return {
        geolibreApp,
        unsubscribe,
        emit: (change: GeoLibreEditSessionChange) => listener?.(change),
    };
}

describe("watchEditSessionEnds", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("reports a saved session end on a watched layer from the host's events", () => {
        const { geolibreApp, unsubscribe, emit } = hostWithSessionEvents();
        const onSessionEnd = vi.fn();

        const stopWatching = watchEditSessionEnds(
            geolibreApp,
            () => ["watched"],
            onSessionEnd,
        );
        emit({ layerId: "watched", state: "started" });
        emit({ layerId: "watched", state: "ended", saved: false });
        emit({ layerId: "other", state: "ended", saved: true });
        emit({ layerId: "watched", state: "ended", saved: true });
        stopWatching();

        expect(onSessionEnd.mock.calls).toEqual([["watched"]]);
        expect(unsubscribe).toHaveBeenCalledOnce();
    });

    it("falls back to the layer reappearing on GeoLibre 3.4.0", () => {
        vi.useFakeTimers();
        let summaries = [layerSummary("watched", true)];
        const geolibreApp = {
            addGeoJsonLayer: vi.fn(),
            listLayers: () => summaries,
        } as unknown as GeoLibreAppAPI;
        const onSessionEnd = vi.fn();

        const stopWatching = watchEditSessionEnds(
            geolibreApp,
            () => ["watched"],
            onSessionEnd,
        );
        vi.advanceTimersByTime(1000);
        summaries = [layerSummary("watched", false)];
        vi.advanceTimersByTime(1000);
        expect(onSessionEnd).not.toHaveBeenCalled();
        summaries = [layerSummary("watched", true)];
        vi.advanceTimersByTime(1000);
        expect(onSessionEnd).toHaveBeenCalledWith("watched");

        stopWatching();
        summaries = [layerSummary("watched", false)];
        vi.advanceTimersByTime(1000);
        summaries = [layerSummary("watched", true)];
        vi.advanceTimersByTime(1000);
        expect(onSessionEnd).toHaveBeenCalledOnce();
    });
});

describe("isLayerBeingEdited", () => {
    it("asks the host which layer is open in the editor", () => {
        const { geolibreApp } = hostWithSessionEvents();

        expect(isLayerBeingEdited(geolibreApp, "edited")).toBe(true);
        expect(isLayerBeingEdited(geolibreApp, "other")).toBe(false);
    });

    it("falls back to the layer being hidden on GeoLibre 3.4.0", () => {
        const geolibreApp = {
            addGeoJsonLayer: vi.fn(),
            listLayers: () => [
                layerSummary("hidden", false),
                layerSummary("shown", true),
            ],
        } as unknown as GeoLibreAppAPI;

        expect(isLayerBeingEdited(geolibreApp, "hidden")).toBe(true);
        expect(isLayerBeingEdited(geolibreApp, "shown")).toBe(false);
    });
});
