import { onBeforeUnmount, ref, watch } from "vue";

import { useArchesWorkspace } from "@/arches_geolibre/composables/use-arches-workspace.ts";
import { useArchesFetch } from "@/arches_geolibre/composables/use-geolibre-app.ts";
import {
    fetchGeometryByResource,
    searchResourcePage,
} from "@/arches_geolibre/utils/arches-client.ts";

import type { ResourceResult } from "@/arches_geolibre/components/EditResourcesSection/components/ResourceFinder/types.ts";
import type { ArchesGeometryNode } from "@/arches_geolibre/types.ts";

const TYPING_DELAY_MILLISECONDS = 300;

/**
 * Pages through a resource model's resources, filtered by name, and either
 * only those with no geometry in the node or all of them, marked with
 * whether each has geometry.
 */
export function useResourceSearch(
    node: () => ArchesGeometryNode,
    options: { onlyMissingGeometry: boolean },
) {
    const workspace = useArchesWorkspace();
    const archesFetch = useArchesFetch();

    const text = ref("");
    const page = ref(1);
    const results = ref<ResourceResult[]>([]);
    const totalCount = ref(0);
    const isTotalCapped = ref(false);
    const hasNextPage = ref(false);
    const isSearching = ref(false);
    const searchError = ref<unknown>(null);

    let abortController: AbortController | null = null;
    let typingTimer: ReturnType<typeof setTimeout> | undefined;

    async function search(): Promise<void> {
        const session = workspace.session;
        if (!session) {
            return;
        }
        if (!options.onlyMissingGeometry && !text.value.trim()) {
            results.value = [];
            hasNextPage.value = false;
            return;
        }
        abortController?.abort();
        abortController = new AbortController();
        const { signal } = abortController;
        isSearching.value = true;
        searchError.value = null;
        try {
            const searchPage = await searchResourcePage(archesFetch, session, {
                graphId: node().graph_id,
                text: text.value,
                page: page.value,
                missingGeometryNodeId: options.onlyMissingGeometry
                    ? node().nodeid
                    : undefined,
                signal,
            });
            totalCount.value = searchPage.totalCount;
            isTotalCapped.value = searchPage.isTotalCapped;
            hasNextPage.value = searchPage.hasNextPage;
            results.value = searchPage.results.map((result) => ({
                ...result,
                hasGeometry: options.onlyMissingGeometry ? false : null,
            }));
            if (!options.onlyMissingGeometry) {
                await markGeometry(searchPage.results, signal);
            }
        } catch (error) {
            if (!signal.aborted) {
                searchError.value = error;
            }
        } finally {
            if (!signal.aborted) {
                isSearching.value = false;
            }
        }
    }

    async function markGeometry(
        pageResults: { resourceInstanceId: string }[],
        signal: AbortSignal,
    ): Promise<void> {
        const session = workspace.session;
        if (!session || pageResults.length === 0) {
            return;
        }
        const geometryByResource = await fetchGeometryByResource(
            archesFetch,
            session,
            node().nodeid,
            pageResults.map((result) => result.resourceInstanceId),
        );
        if (!signal.aborted) {
            results.value = results.value.map((result) => ({
                ...result,
                hasGeometry: geometryByResource.has(result.resourceInstanceId),
            }));
        }
    }

    function goToPage(pageNumber: number): Promise<void> {
        page.value = pageNumber;
        return search();
    }

    watch(text, () => {
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
            page.value = 1;
            void search();
        }, TYPING_DELAY_MILLISECONDS);
    });

    onBeforeUnmount(() => {
        clearTimeout(typingTimer);
        abortController?.abort();
    });

    return {
        text,
        page,
        results,
        totalCount,
        isTotalCapped,
        hasNextPage,
        isSearching,
        searchError,
        search,
        goToPage,
    };
}
