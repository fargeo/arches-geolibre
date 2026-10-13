import { useGettext } from "vue3-gettext";

import { ArchesRequestError } from "@/arches_geolibre/utils/arches-client.ts";

/** Turns a failed Arches request into a sentence a user can act on. */
export function useDescribeRequestError(): (error: unknown) => string {
    const { $gettext } = useGettext();
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
        if (error instanceof TypeError) {
            return $gettext(
                "Couldn't reach Arches. Check your connection and the Arches URL.",
            );
        }
        return String(error);
    };
}
