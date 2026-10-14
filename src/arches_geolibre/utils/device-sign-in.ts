import {
    ArchesRequestError,
    expectingStatuses,
    normalizeInstanceUrl,
    sessionFromTokens,
} from "@/arches_geolibre/utils/arches-client.ts";

import type { ArchesSession } from "@/arches_geolibre/types.ts";

/**
 * Browser sign-in through the OAuth 2.0 device authorization grant
 * (RFC 8628): the user approves the plugin on Arches' own sign-in page, so
 * single sign-on and two-factor authentication work.
 */

const DEVICE_CODE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";
const DEFAULT_VERIFICATION_PATH = "/o/device/";
const SLOW_DOWN_INCREMENT_SECONDS = 5;
// The device endpoints reject the "; charset=UTF-8" that fetch adds by default.
const FORM_HEADERS = { "Content-Type": "application/x-www-form-urlencoded" };

export interface DeviceSignIn {
    instanceUrl: string;
    clientId: string;
    deviceCode: string;
    userCode: string;
    /** Arches' page for entering the code, with the code already filled in. */
    verificationUrl: string;
    intervalSeconds: number;
    expiresAt: number;
}

export class DeviceSignInError extends Error {
    constructor(
        message: string,
        readonly reason: "not-enabled" | "denied" | "expired",
    ) {
        super(message);
        this.name = "DeviceSignInError";
    }
}

/** Asks Arches for a code the user will approve in their browser. */
export async function startDeviceSignIn(
    fetchImplementation: typeof fetch,
    instanceUrl: string,
): Promise<DeviceSignIn> {
    const normalizedInstanceUrl = normalizeInstanceUrl(instanceUrl);
    // 404 means the instance doesn't offer browser sign-in.
    const clientIdResponse = await fetchImplementation(
        `${normalizedInstanceUrl}/auth/device_client_id`,
        { headers: expectingStatuses(404) },
    );
    if (clientIdResponse.status === 404) {
        throw new DeviceSignInError(
            "This Arches instance isn't set up for browser sign-in.",
            "not-enabled",
        );
    }
    await throwUnlessOk(clientIdResponse, "Could not start browser sign-in");
    const { clientid: clientId } = (await clientIdResponse.json()) as {
        clientid: string;
    };

    const authorizationResponse = await fetchImplementation(
        `${normalizedInstanceUrl}/o/device-authorization/`,
        {
            method: "POST",
            headers: FORM_HEADERS,
            body: new URLSearchParams({ client_id: clientId }),
        },
    );
    await throwUnlessOk(
        authorizationResponse,
        "Could not start browser sign-in",
    );
    const authorization = (await authorizationResponse.json()) as {
        device_code: string;
        user_code: string;
        verification_uri: string | null;
        expires_in: number;
        interval?: number;
    };

    const verificationUrl = new URL(
        authorization.verification_uri ?? DEFAULT_VERIFICATION_PATH,
        `${normalizedInstanceUrl}/`,
    );
    verificationUrl.searchParams.set("user_code", authorization.user_code);
    return {
        instanceUrl: normalizedInstanceUrl,
        clientId,
        deviceCode: authorization.device_code,
        userCode: authorization.user_code,
        verificationUrl: verificationUrl.toString(),
        intervalSeconds: authorization.interval ?? 5,
        expiresAt: Date.now() + authorization.expires_in * 1000,
    };
}

/**
 * Polls Arches until the user approves or denies the sign-in, the code
 * expires, or `signal` aborts. Arches answers "authorization_pending" until
 * then, and "slow_down" when polled too often.
 */
export async function waitForDeviceApproval(
    fetchImplementation: typeof fetch,
    deviceSignIn: DeviceSignIn,
    signal?: AbortSignal,
): Promise<ArchesSession> {
    let intervalSeconds = deviceSignIn.intervalSeconds;
    while (Date.now() < deviceSignIn.expiresAt) {
        await pause(intervalSeconds * 1000, signal);
        const tokenResponse = await fetchImplementation(
            `${deviceSignIn.instanceUrl}/o/token/`,
            {
                method: "POST",
                // Arches answers 400 "authorization_pending" until approval.
                headers: { ...FORM_HEADERS, ...expectingStatuses(400) },
                body: new URLSearchParams({
                    grant_type: DEVICE_CODE_GRANT_TYPE,
                    device_code: deviceSignIn.deviceCode,
                    client_id: deviceSignIn.clientId,
                }),
                signal,
            },
        );
        if (tokenResponse.ok) {
            return sessionFromTokens(
                fetchImplementation,
                deviceSignIn.instanceUrl,
                deviceSignIn.clientId,
                await tokenResponse.json(),
            );
        }
        const { error } = (await tokenResponse.json().catch(() => ({}))) as {
            error?: string;
        };
        if (error === "slow_down") {
            intervalSeconds += SLOW_DOWN_INCREMENT_SECONDS;
        } else if (error === "access_denied") {
            throw new DeviceSignInError("The sign-in was declined.", "denied");
        } else if (error === "expired_token") {
            break;
        } else if (error !== "authorization_pending") {
            throw new ArchesRequestError(
                `Browser sign-in failed (HTTP ${tokenResponse.status}): ${error ?? "unknown error"}`,
                tokenResponse.status,
            );
        }
    }
    throw new DeviceSignInError(
        "The sign-in code expired before it was approved.",
        "expired",
    );
}

function pause(milliseconds: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(signal.reason);
            return;
        }
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

async function throwUnlessOk(
    response: Response,
    message: string,
): Promise<void> {
    if (!response.ok) {
        throw new ArchesRequestError(
            `${message} (HTTP ${response.status})`,
            response.status,
        );
    }
}
