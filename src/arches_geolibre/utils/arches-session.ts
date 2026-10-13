import { CREDENTIAL_SESSION_NAME } from "@/arches_geolibre/constants.ts";
import { removeLayer } from "@/arches_geolibre/utils/arches-layers.ts";
import { loadTrackedReviewTiles } from "@/arches_geolibre/utils/pending-review.ts";

import type { GeoLibreAppAPI } from "@/arches_geolibre/geolibre/host-api.ts";
import type { ArchesSession } from "@/arches_geolibre/types.ts";
import type { ArchesWorkspace } from "@/arches_geolibre/workspace.ts";
import type { SessionStore } from "@/arches_geolibre/utils/session-refresh.ts";

/**
 * On Desktop, sessions go to the OS keychain. On the web, GeoLibre's store is
 * plain localStorage, which any other plugin in the page can read, so a
 * session is only saved there if the user asks.
 */
export function isSessionSavingOptional(geolibreApp: GeoLibreAppAPI): boolean {
    return geolibreApp.credentials?.location() === "browser";
}

export function readSavedSession(
    geolibreApp: GeoLibreAppAPI,
): ArchesSession | null {
    const savedSession = geolibreApp.credentials?.get(CREDENTIAL_SESSION_NAME);
    return savedSession ? (JSON.parse(savedSession) as ArchesSession) : null;
}

export function startSession(
    geolibreApp: GeoLibreAppAPI,
    workspace: ArchesWorkspace,
    session: ArchesSession,
    shouldSave: boolean,
): void {
    workspace.isSessionSaved = shouldSave;
    saveSession(geolibreApp, workspace, session);
    workspace.hasSessionExpired = false;
    workspace.trackedReviewTiles = loadTrackedReviewTiles(session);
}

export function endSession(
    geolibreApp: GeoLibreAppAPI,
    workspace: ArchesWorkspace,
): void {
    geolibreApp.credentials?.set(CREDENTIAL_SESSION_NAME, "");
    workspace.session = null;
    workspace.isSessionSaved = false;
    workspace.trackedReviewTiles = [];
    if (workspace.awaitingReviewLayerId) {
        removeLayer(geolibreApp, workspace.awaitingReviewLayerId);
        workspace.awaitingReviewLayerId = null;
    }
}

export function workspaceSessionStore(
    geolibreApp: GeoLibreAppAPI,
    workspace: ArchesWorkspace,
): SessionStore {
    return {
        current: () => workspace.session,
        replace: (session) => saveSession(geolibreApp, workspace, session),
        expire: () => {
            endSession(geolibreApp, workspace);
            workspace.hasSessionExpired = true;
        },
    };
}

function saveSession(
    geolibreApp: GeoLibreAppAPI,
    workspace: ArchesWorkspace,
    session: ArchesSession,
): void {
    geolibreApp.credentials?.set(
        CREDENTIAL_SESSION_NAME,
        workspace.isSessionSaved ? JSON.stringify(session) : "",
    );
    workspace.session = session;
}
