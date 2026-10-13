import { useGettext } from "vue3-gettext";

import { useGeoLibreApp } from "@/arches_geolibre/composables/use-geolibre-app.ts";
import {
    ArchesRequestError,
    GeoJsonUnavailableError,
} from "@/arches_geolibre/utils/arches-client.ts";

const COMPATIBILITY_GUIDE_URL =
    "https://github.com/fargeo/arches-geolibre/blob/main/docs/arches-compatibility.md";

/** Turns a failed Arches request into a sentence a user can act on. */
export function useDescribeRequestError(): (error: unknown) => string {
    const { $gettext } = useGettext();
    // Without GeoLibre Desktop's native HTTP client, requests are subject to
    // CORS, and a browser reports a CORS refusal like a network failure.
    const isSubjectToCors = !useGeoLibreApp().nativeFetch;
    return (error) => {
        if (error instanceof GeoJsonUnavailableError) {
            return $gettext(
                "Arches couldn't return geometry (HTTP %{status}). It may be missing a fix this plugin needs (archesproject/arches#13011, due in Arches 8.2.0). See which Arches to use: %{url}",
                { status: String(error.status), url: COMPATIBILITY_GUIDE_URL },
            );
        }
        if (error instanceof ArchesRequestError) {
            if (error.status === 401 || error.status === 403) {
                return $gettext(
                    "Arches refused the request. Your account may not have permission for this.",
                );
            }
            if (error.status >= 500) {
                return $gettext(
                    "Arches ran into a problem (HTTP %{status}). Try again; if it keeps happening, ask your Arches administrator to check the server logs.",
                    { status: String(error.status) },
                );
            }
            return $gettext("Arches rejected the request: %{detail}", {
                detail: error.message,
            });
        }
        if (error instanceof TypeError && isSubjectToCors) {
            return $gettext(
                "Couldn't reach Arches. Check your connection and the Arches URL. If both are right, the Arches instance may not accept requests from %{origin}: ask its administrator to add %{origin} to CORS_ALLOWED_ORIGINS.",
                { origin: window.location.origin },
            );
        }
        if (error instanceof TypeError) {
            return $gettext(
                "Couldn't reach Arches. Check your connection and the Arches URL.",
            );
        }
        return String(error);
    };
}
