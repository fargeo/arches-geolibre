import {
    DeviceSignInError,
    startDeviceSignIn,
    waitForDeviceApproval,
} from "@/arches_geolibre/utils/device-sign-in.ts";

import type { DeviceSignIn } from "@/arches_geolibre/utils/device-sign-in.ts";

const INSTANCE_URL = "https://arches.example.org";

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

const approvedTokens = {
    access_token: "access",
    refresh_token: "refresh",
    expires_in: 3600,
};

const userProfile = { id: 7, username: "editor", is_reviewer: true };

function makeDeviceSignIn(): DeviceSignIn {
    return {
        instanceUrl: INSTANCE_URL,
        clientId: "device-client",
        deviceCode: "device-code",
        userCode: "ABCD-1234",
        verificationUrl: `${INSTANCE_URL}/o/device/?user_code=ABCD-1234`,
        intervalSeconds: 5,
        expiresAt: Date.now() + 60_000,
    };
}

/** Answers token polls with `tokenAnswers` in turn, then the user profile. */
function fakeArches(tokenAnswers: Response[]) {
    const tokenRequestTimes: number[] = [];
    const fetchImplementation = vi.fn(async (url: RequestInfo | URL) => {
        if (String(url).endsWith("/o/token/")) {
            tokenRequestTimes.push(Date.now());
            return tokenAnswers.shift()!;
        }
        return jsonResponse(userProfile);
    });
    return { fetchImplementation, tokenRequestTimes };
}

describe("startDeviceSignIn", () => {
    it("resolves Arches' relative code page and pre-fills the code", async () => {
        const fetchImplementation = vi.fn(async (url: RequestInfo | URL) =>
            String(url).endsWith("/auth/device_client_id")
                ? jsonResponse({ clientid: "device-client" })
                : jsonResponse({
                      device_code: "device-code",
                      user_code: "ABCD-1234",
                      verification_uri: "/o/device/",
                      expires_in: 600,
                      interval: 5,
                  }),
        );

        const deviceSignIn = await startDeviceSignIn(
            fetchImplementation,
            `${INSTANCE_URL}/`,
        );

        expect(deviceSignIn).toMatchObject({
            instanceUrl: INSTANCE_URL,
            clientId: "device-client",
            userCode: "ABCD-1234",
            verificationUrl: `${INSTANCE_URL}/o/device/?user_code=ABCD-1234`,
        });
    });

    it("reports when the instance doesn't offer browser sign-in", async () => {
        const fetchImplementation = vi.fn(async () =>
            jsonResponse({ message: "not enabled" }, 404),
        );

        await expect(
            startDeviceSignIn(fetchImplementation, INSTANCE_URL),
        ).rejects.toMatchObject({ reason: "not-enabled" });
    });
});

describe("waitForDeviceApproval", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("polls until approved, slowing down when asked", async () => {
        const startTime = Date.now();
        const { fetchImplementation, tokenRequestTimes } = fakeArches([
            jsonResponse({ error: "authorization_pending" }, 400),
            jsonResponse({ error: "slow_down" }, 400),
            jsonResponse(approvedTokens),
        ]);

        const approval = waitForDeviceApproval(
            fetchImplementation,
            makeDeviceSignIn(),
        );
        await vi.runAllTimersAsync();

        await expect(approval).resolves.toMatchObject({
            accessToken: "access",
            refreshToken: "refresh",
            username: "editor",
            isReviewer: true,
        });
        expect(
            tokenRequestTimes.map((requestTime) => requestTime - startTime),
        ).toEqual([5_000, 10_000, 20_000]);
    });

    it("stops when the user declines", async () => {
        const { fetchImplementation } = fakeArches([
            jsonResponse({ error: "access_denied" }, 400),
        ]);

        const approval = waitForDeviceApproval(
            fetchImplementation,
            makeDeviceSignIn(),
        );
        const outcome = expect(approval).rejects.toMatchObject({
            reason: "denied",
        });
        await vi.runAllTimersAsync();
        await outcome;
    });

    it("gives up once the code expires", async () => {
        const { fetchImplementation } = fakeArches(
            Array.from({ length: 20 }, () =>
                jsonResponse({ error: "authorization_pending" }, 400),
            ),
        );

        const approval = waitForDeviceApproval(
            fetchImplementation,
            makeDeviceSignIn(),
        );
        const outcome =
            expect(approval).rejects.toBeInstanceOf(DeviceSignInError);
        await vi.runAllTimersAsync();
        await outcome;
        expect(fetchImplementation).toHaveBeenCalledTimes(12);
    });

    it("stops polling when cancelled", async () => {
        const { fetchImplementation } = fakeArches([]);
        const abortController = new AbortController();

        const approval = waitForDeviceApproval(
            fetchImplementation,
            makeDeviceSignIn(),
            abortController.signal,
        );
        const outcome = expect(approval).rejects.toThrow();
        abortController.abort();
        await vi.runAllTimersAsync();
        await outcome;
        expect(fetchImplementation).not.toHaveBeenCalled();
    });
});
