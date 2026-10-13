import { refreshSession } from "@/arches_geolibre/utils/arches-client.ts";
import {
    startDeviceSignIn,
    waitForDeviceApproval,
} from "@/arches_geolibre/utils/device-sign-in.ts";

import {
    ARCHES_TEST_URL,
    CONTRIBUTOR_USERNAME,
    TEST_PASSWORD,
} from "./support.ts";

import type { DeviceSignIn } from "@/arches_geolibre/utils/device-sign-in.ts";

/** Stands in for the user's browser: signs in to Arches and answers the code page. */
class ArchesBrowser {
    private readonly cookies = new Map<string, string>();

    async signIn(username: string): Promise<void> {
        await this.request(`${ARCHES_TEST_URL}/auth/`);
        const signInResponse = await this.submitForm(
            `${ARCHES_TEST_URL}/auth/`,
            { username, password: TEST_PASSWORD },
        );
        if (signInResponse.status !== 302) {
            throw new Error(`Could not sign in to Arches as ${username}`);
        }
    }

    /** Enters the code on Arches' code page, then accepts or denies. */
    async answer(
        deviceSignIn: DeviceSignIn,
        action: "accept" | "deny",
    ): Promise<void> {
        const codeResponse = await this.submitForm(
            deviceSignIn.verificationUrl,
            { user_code: deviceSignIn.userCode },
        );
        const confirmUrl = codeResponse.headers.get("Location");
        if (!confirmUrl) {
            throw new Error(
                `Arches didn't accept the code (HTTP ${codeResponse.status})`,
            );
        }
        const confirmResponse = await this.submitForm(
            new URL(confirmUrl, ARCHES_TEST_URL).toString(),
            { action },
        );
        if (confirmResponse.status !== 302) {
            throw new Error(
                `Arches didn't record the answer (HTTP ${confirmResponse.status})`,
            );
        }
    }

    private submitForm(
        url: string,
        fields: Record<string, string>,
    ): Promise<Response> {
        return this.request(url, {
            method: "POST",
            body: new URLSearchParams({
                ...fields,
                csrfmiddlewaretoken: this.cookies.get("csrftoken") ?? "",
            }),
        });
    }

    private async request(url: string, init: RequestInit = {}) {
        const response = await fetch(url, {
            ...init,
            redirect: "manual",
            headers: {
                Cookie: [...this.cookies]
                    .map(([name, value]) => `${name}=${value}`)
                    .join("; "),
            },
        });
        for (const setCookie of response.headers.getSetCookie()) {
            const [nameAndValue] = setCookie.split(";");
            const separatorIndex = nameAndValue.indexOf("=");
            this.cookies.set(
                nameAndValue.slice(0, separatorIndex),
                nameAndValue.slice(separatorIndex + 1),
            );
        }
        return response;
    }
}

async function startTestSignIn(): Promise<DeviceSignIn> {
    // Poll quickly: the test answers before the first poll.
    return {
        ...(await startDeviceSignIn(fetch, ARCHES_TEST_URL)),
        intervalSeconds: 1,
    };
}

describe("browser sign-in", () => {
    it("signs in once the user approves the code in Arches", async () => {
        const deviceSignIn = await startTestSignIn();
        expect(deviceSignIn.verificationUrl).toBe(
            `${ARCHES_TEST_URL}/o/device/?user_code=${deviceSignIn.userCode}`,
        );

        const browser = new ArchesBrowser();
        await browser.signIn(CONTRIBUTOR_USERNAME);
        await browser.answer(deviceSignIn, "accept");
        const session = await waitForDeviceApproval(fetch, deviceSignIn);

        expect(session).toMatchObject({
            username: CONTRIBUTOR_USERNAME,
            isReviewer: false,
        });

        const refreshedSession = await refreshSession(fetch, session);
        expect(refreshedSession.accessToken).not.toBe(session.accessToken);
        expect(refreshedSession.username).toBe(CONTRIBUTOR_USERNAME);
    });

    it("stops when the user denies the code", async () => {
        const deviceSignIn = await startTestSignIn();

        const browser = new ArchesBrowser();
        await browser.signIn(CONTRIBUTOR_USERNAME);
        await browser.answer(deviceSignIn, "deny");

        await expect(
            waitForDeviceApproval(fetch, deviceSignIn),
        ).rejects.toMatchObject({ reason: "denied" });
    });
});
