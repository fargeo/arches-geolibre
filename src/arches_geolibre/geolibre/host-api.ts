/**
 * The subset of GeoLibre's plugin host contract this plugin uses.
 *
 * `@geolibre/plugins` is not published to npm, so these declarations are
 * copied from GeoLibre 3.4.0 `packages/plugins/src/types.ts` (MIT licensed,
 * Copyright (c) 2026 Qiusheng Wu). Every member that GeoLibre marks optional
 * stays optional here: call them with optional chaining so older hosts
 * degrade instead of throwing.
 */

import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";

export type GeoLibreMapControlPosition =
    "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface GeoLibreLayerSummary {
    id: string;
    name: string;
    type: string;
    visible: boolean;
    opacity: number;
}

export interface GeoLibreSelection {
    layerId: string | null;
    features: Feature<Geometry | null>[];
}

export type GeoLibreActiveMapTool =
    "identify" | "feature-selection" | "geo-editor" | null;

export type GeoLibreCredentialLocation = "keychain" | "browser";

export interface GeoLibrePluginCredentials {
    get(name: string): string;
    set(name: string, value: string): boolean;
    location(): GeoLibreCredentialLocation;
}

export type GeoLibreRightPanelDock =
    | "left-of-layers"
    | "right-of-layers"
    | "left-of-style"
    | "right-of-style"
    | "replace-style"
    | "replace-layers";

export interface GeoLibreRightPanelRegistration {
    id: string;
    title: string | (() => string);
    dock?: GeoLibreRightPanelDock;
    icon?: string;
    defaultWidth?: number;
    deactivatePluginOnClose?: boolean;
    render: (container: HTMLElement) => void | (() => void);
    onOpen?: () => void;
    onCollapse?: () => void;
    onClose?: () => void;
    onExplicitClose?: () => void;
}

export interface GeoLibreAppAPI {
    addGeoJsonLayer: (
        name: string,
        data: FeatureCollection,
        sourcePath?: string,
    ) => string;
    listLayers?: () => GeoLibreLayerSummary[];
    getLayers?: () => string[];
    getLayerFeatures?: (layerId: string) => Feature<Geometry | null>[];
    getSelectedFeatures?: () => Feature<Geometry | null>[];
    getSelectedLayerId?: () => string | null;
    onSelectionChange?: (
        callback: (selection: GeoLibreSelection) => void,
    ) => () => void;
    getActiveMapTool?: () => GeoLibreActiveMapTool;
    onActiveMapToolChange?: (
        callback: (tool: GeoLibreActiveMapTool) => void,
    ) => () => void;
    onLayersChanged?: (callback: (layerIds: string[]) => void) => () => void;
    getMap?: () => MapLibreMap | null;
    /**
     * Meant for plugin-owned native layers, but in GeoLibre 3.4.0 it removes
     * any layer by id. The plugin API has no removeLayer, so this is the only
     * way to drop a stale layer; treat it as unsupported and re-check on
     * every GeoLibre upgrade.
     */
    unregisterExternalNativeLayer?: (id: string) => void;
    importLayerStyle?: (
        layerId: string,
        text: string,
    ) =>
        | { ok: true; warnings: string[] }
        | {
              ok: false;
              reason: "invalid" | "no-match" | "unsupported-layer";
              warnings: string[];
          };
    openExternalUrl?: (url: string) => void;
    onLocaleChange?: (listener: (locale: string) => void) => () => void;
    getViewBounds?: () => [number, number, number, number] | null;
    fitBounds?: (bounds: [number, number, number, number]) => void;
    nativeFetch?: typeof globalThis.fetch;
    credentials?: GeoLibrePluginCredentials;
    getLocale?: () => string;
    registerRightPanel?: (panel: GeoLibreRightPanelRegistration) => () => void;
    unregisterRightPanel?: (id: string) => void;
    openRightPanel?: (id: string) => boolean;
    closeRightPanel?: (id: string) => void;
}

export interface GeoLibrePlugin {
    id: string;
    name: string;
    version: string;
    activeByDefault?: boolean;
    engines?: ("maplibre" | "mapbox" | "cesium" | "arcgis")[];
    activate: (app: GeoLibreAppAPI) => boolean | void | Promise<boolean | void>;
    deactivate: (app: GeoLibreAppAPI) => void;
    getProjectState?: () => unknown;
    applyProjectState?: (app: GeoLibreAppAPI, state: unknown) => boolean | void;
}
