const TRANSIENT_STATUS_CODES = new Set([502, 503, 504]);
const RETRY_DELAYS_MILLISECONDS = [1_000, 3_000];

/**
 * Wraps fetch so reads survive a dropped connection or a gateway hiccup.
 * Only GET requests are retried: repeating a write could, for example,
 * create a resource twice.
 */
export function createRetryingFetch(baseFetch: typeof fetch): typeof fetch {
    return async (input, init) => {
        const isRead = (init?.method ?? "GET").toUpperCase() === "GET";
        for (const retryDelay of isRead ? RETRY_DELAYS_MILLISECONDS : []) {
            try {
                const response = await baseFetch(input, init);
                if (!TRANSIENT_STATUS_CODES.has(response.status)) {
                    return response;
                }
            } catch (error) {
                if (init?.signal?.aborted || !(error instanceof TypeError)) {
                    throw error;
                }
            }
            await pause(retryDelay, init?.signal);
        }
        return baseFetch(input, init);
    };
}

function pause(milliseconds: number, signal?: AbortSignal | null) {
    return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, milliseconds);
        signal?.addEventListener(
            "abort",
            () => {
                clearTimeout(timer);
                reject(signal.reason);
            },
            { once: true },
        );
    });
}
