import type { InjectionKey } from "vue";

import type { GeoLibreAppAPI } from "@/arches_geolibre/geolibre/host-api.ts";
import type { ArchesWorkspace } from "@/arches_geolibre/workspace.ts";

export const PLUGIN_ID = "arches-geolibre";
export const PANEL_ID = `${PLUGIN_ID}-panel`;
export const CREDENTIAL_SESSION_NAME = "session";

export const GEOLIBRE_APP_KEY: InjectionKey<GeoLibreAppAPI> =
    Symbol("geolibreApp");
export const ARCHES_FETCH_KEY: InjectionKey<typeof fetch> =
    Symbol("archesFetch");
export const WORKSPACE_KEY: InjectionKey<ArchesWorkspace> =
    Symbol("archesWorkspace");
