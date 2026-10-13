import { useGettext } from "vue3-gettext";

import { useGeoLibreApp } from "@/arches_geolibre/composables/use-geolibre-app.ts";
import { ArchesRequestError } from "@/arches_geolibre/utils/arches-client.ts";

/** Turns a failed Arches request into a sentence a user can act on. */
export function useDescribeRequestError(): (error: unknown) => string {
    const { $gettext } = useGettext();
    // Without GeoLibre Desktop's native HTTP client, requests are subject to
    // CORS, and a browser reports a CORS refusal like a network failure.
    const isSubjectToCors = !useGeoLibreApp().nativeFetch;
    return (error) => {
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
