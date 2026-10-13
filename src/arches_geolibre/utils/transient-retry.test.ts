import { createRetryingFetch } from "@/arches_geolibre/utils/transient-retry.ts";

const URL = "https://arches.example.org/geojson";

function answers(...outcomes: (number | Error)[]) {
    return vi.fn(async () => {
        const outcome = outcomes.shift()!;
        if (outcome instanceof Error) {
            throw outcome;
        }
        return new Response(null, { status: outcome });
    });
}

describe("createRetryingFetch", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("retries a read after a dropped connection or a gateway error", async () => {
        const baseFetch = answers(new TypeError("Failed to fetch"), 503, 200);

        const responsePromise = createRetryingFetch(baseFetch)(URL);
        await vi.runAllTimersAsync();

        expect((await responsePromise).status).toBe(200);
        expect(baseFetch).toHaveBeenCalledTimes(3);
    });

    it("returns the last answer once retries run out", async () => {
        const baseFetch = answers(502, 502, 502);

        const responsePromise = createRetryingFetch(baseFetch)(URL);
        await vi.runAllTimersAsync();

        expect((await responsePromise).status).toBe(502);
    });

    it("never repeats a write", async () => {
        const baseFetch = answers(503);

        const response = await createRetryingFetch(baseFetch)(URL, {
            method: "POST",
        });

        expect(response.status).toBe(503);
        expect(baseFetch).toHaveBeenCalledTimes(1);
    });

    it("doesn't retry errors that aren't transient", async () => {
        const baseFetch = answers(500);

        const response = await createRetryingFetch(baseFetch)(URL);

        expect(response.status).toBe(500);
        expect(baseFetch).toHaveBeenCalledTimes(1);
    });
});
