// Shared set-up for the demo recordings: building GeoLibre's web build with
// the plugin, serving it, and recording a browser session with a visible
// pointer and captions.

import { execFileSync, spawn } from "node:child_process";
import { cp, mkdir, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

export const REPOSITORY_ROOT = dirname(
    dirname(dirname(fileURLToPath(import.meta.url))),
);
export const OUTPUT_DIRECTORY = join(REPOSITORY_ROOT, "demo");
export const ARCHES_URL =
    process.env.ARCHES_TEST_URL ?? "http://localhost:8002";
const GEOLIBRE_DIR = resolve(
    REPOSITORY_ROOT,
    process.env.GEOLIBRE_DIR ?? ".geolibre",
);
const GEOLIBRE_PORT = Number(process.env.GEOLIBRE_PORT ?? 4173);
export const GEOLIBRE_URL = `http://localhost:${GEOLIBRE_PORT}`;

// Matches test-instance/geolibre_test_support/constants.py.
export const EDITOR_USERNAME = "geolibre_editor";
const TEST_PASSWORD = "geolibre-test-password";
const PASSWORD_CLIENT_ID = "arches-geolibre-test";
const VIEWPORT = { width: 1440, height: 900 };

export async function fetchEditorToken() {
    const response = await fetch(`${ARCHES_URL}/o/token/`, {
        method: "POST",
        body: new URLSearchParams({
            grant_type: "password",
            client_id: PASSWORD_CLIENT_ID,
            username: EDITOR_USERNAME,
            password: TEST_PASSWORD,
        }),
    });
    if (!response.ok) {
        throw new Error(
            `Could not sign in to Arches at ${ARCHES_URL} (HTTP ${response.status}). Is the test instance running?`,
        );
    }
    return (await response.json()).access_token;
}

export async function buildGeoLibreWithPlugin() {
    execFileSync("npm", ["run", "build"], {
        cwd: REPOSITORY_ROOT,
        stdio: "inherit",
    });
    const bundledPluginDirectory = join(
        GEOLIBRE_DIR,
        "apps/geolibre-desktop/public/plugins/arches-geolibre",
    );
    await rm(bundledPluginDirectory, { recursive: true, force: true });
    await cp(join(REPOSITORY_ROOT, "geolibre-plugin"), bundledPluginDirectory, {
        recursive: true,
    });
    execFileSync("npm", ["run", "build"], {
        cwd: GEOLIBRE_DIR,
        stdio: "inherit",
    });
}

async function isReachable(url) {
    try {
        return (await fetch(url)).ok;
    } catch {
        return false;
    }
}

/** Starts GeoLibre's preview server unless one is already running. */
export async function ensurePreviewServer() {
    if (await isReachable(GEOLIBRE_URL)) {
        return null;
    }
    const previewServer = spawn(
        "npm",
        [
            "run",
            "preview",
            "-w",
            "geolibre-desktop",
            "--",
            "--port",
            String(GEOLIBRE_PORT),
            "--strictPort",
        ],
        { cwd: GEOLIBRE_DIR, stdio: "ignore", detached: true },
    );
    for (let attempt = 0; attempt < 60; attempt += 1) {
        if (await isReachable(GEOLIBRE_URL)) {
            return previewServer;
        }
        await new Promise((resolveWait) => setTimeout(resolveWait, 500));
    }
    throw new Error(
        `GeoLibre's preview server didn't start on ${GEOLIBRE_URL}.`,
    );
}

// Playwright's videos don't show the pointer, so draw one, plus captions.
function installOverlay() {
    window.addEventListener("DOMContentLoaded", () => {
        const pointer = document.createElement("div");
        pointer.style.cssText =
            "position:fixed;z-index:2147483647;pointer-events:none;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(220,38,38,.35);border:2px solid rgb(220,38,38);transition:transform .1s;left:-50px;top:-50px";
        document.body.appendChild(pointer);
        window.addEventListener(
            "mousemove",
            (event) => {
                pointer.style.left = `${event.clientX}px`;
                pointer.style.top = `${event.clientY}px`;
            },
            true,
        );
        window.addEventListener(
            "mousedown",
            () => (pointer.style.transform = "scale(.6)"),
            true,
        );
        window.addEventListener(
            "mouseup",
            () => (pointer.style.transform = ""),
            true,
        );

        const caption = document.createElement("div");
        caption.style.cssText =
            "position:fixed;z-index:2147483646;pointer-events:none;left:50%;bottom:56px;transform:translateX(-50%);max-width:70%;padding:12px 22px;border-radius:10px;background:rgba(15,23,42,.88);color:white;font:600 20px/1.35 system-ui,sans-serif;text-align:center;opacity:0;transition:opacity .3s";
        document.body.appendChild(caption);
        window.showCaption = (text) => {
            caption.textContent = text;
            caption.style.opacity = text ? "1" : "0";
        };
    });
}

/** Helpers that act at a watchable pace and show what they do. */
function createStudio(page) {
    const pause = (milliseconds) => page.waitForTimeout(milliseconds);
    const caption = (text) =>
        page.evaluate((value) => window.showCaption(value), text);

    async function glideTo(locator) {
        await locator.scrollIntoViewIfNeeded();
        const box = await locator.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
            steps: 25,
        });
        await pause(250);
    }

    async function glideAndClick(locator) {
        await glideTo(locator);
        await locator.click();
    }

    async function typeInto(locator, text, delay = 45) {
        await glideAndClick(locator);
        await locator.pressSequentially(text, { delay });
    }

    function mapCanvas() {
        return page.locator(".maplibregl-canvas").first();
    }

    async function mapBounds() {
        const statusText = await page
            .locator("body")
            .evaluate(() => document.body.innerText);
        return /BBox: ([-\d.]+), ([-\d.]+), ([-\d.]+), ([-\d.]+)/
            .exec(statusText)
            .slice(1)
            .map(Number);
    }

    const mercatorY = (latitude) =>
        Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360));

    /** Where a coordinate is on screen, from the status bar's map bounds. */
    async function screenPoint({ longitude, latitude }) {
        const [west, south, east, north] = await mapBounds();
        const canvas = await mapCanvas().boundingBox();
        return {
            x: canvas.x + ((longitude - west) / (east - west)) * canvas.width,
            y:
                canvas.y +
                ((mercatorY(north) - mercatorY(latitude)) /
                    (mercatorY(north) - mercatorY(south))) *
                    canvas.height,
        };
    }

    /** A point on the map, as fractions of its width and height. */
    async function mapPoint(fractionX, fractionY) {
        const canvas = await mapCanvas().boundingBox();
        return {
            x: canvas.x + canvas.width * fractionX,
            y: canvas.y + canvas.height * fractionY,
        };
    }

    function layerRow(name) {
        return page.locator(
            `[data-testid="layer-row"][data-layer-name="${name}"]`,
        );
    }

    async function openLayerAction(layerName, actionName) {
        const row = layerRow(layerName);
        await glideAndClick(row.getByRole("button", { name: "Layer actions" }));
        await glideAndClick(
            page.getByRole("menuitem", { name: actionName, exact: true }),
        );
    }

    async function openPluginAndSignIn() {
        await caption("Open the Arches plugin in GeoLibre");
        await glideAndClick(
            page.getByRole("button", { name: "Plugins", exact: true }),
        );
        await page.getByRole("menuitem", { name: /^Installed/ }).hover();
        await glideAndClick(page.getByRole("menuitem", { name: /^Arches/ }));
        await page.keyboard.press("Escape");
        const panel = page.locator(".arches-panel");
        await pause(800);

        await caption("Sign in to an Arches instance");
        await typeInto(panel.getByLabel("Arches URL"), ARCHES_URL);
        await glideAndClick(
            panel.getByRole("button", { name: "Use a password instead" }),
        );
        await typeInto(panel.getByLabel("Username"), EDITOR_USERNAME);
        await typeInto(panel.getByPlaceholder("Password"), TEST_PASSWORD, 25);
        await glideAndClick(
            panel.getByRole("button", { name: "Sign in", exact: true }),
        );
        await panel.getByText("Signed in to").waitFor();
        await pause(1500);
    }

    /** Draws a polygon through points given as fractions of the map. */
    async function drawPolygon(corners) {
        const toolbar = page.locator(".geo-editor-toolbar");
        const expandToolbar = toolbar.locator('button[title="Expand toolbar"]');
        if (await expandToolbar.isVisible()) {
            await glideAndClick(expandToolbar);
        }
        await glideAndClick(toolbar.locator('button[data-mode="polygon"]'));
        for (const [index, [fractionX, fractionY]] of corners.entries()) {
            const corner = await mapPoint(fractionX, fractionY);
            // Geoman places vertices from mouse moves, so glide to each one.
            await page.mouse.move(corner.x, corner.y, { steps: 20 });
            await pause(300);
            if (index < corners.length - 1) {
                await page.mouse.click(corner.x, corner.y);
            } else {
                await page.mouse.dblclick(corner.x, corner.y);
            }
        }
    }

    return {
        page,
        panel: page.locator(".arches-panel"),
        pause,
        caption,
        glideTo,
        glideAndClick,
        typeInto,
        screenPoint,
        mapPoint,
        mapCanvas,
        layerRow,
        openLayerAction,
        openPluginAndSignIn,
        drawPolygon,
    };
}

/**
 * Records one demo to demo/<name>.mp4 (WebM without ffmpeg), running
 * `script` with the studio helpers.
 */
export async function recordVideo(name, script) {
    await mkdir(OUTPUT_DIRECTORY, { recursive: true });
    const browser = await chromium.launch();
    const context = await browser.newContext({
        viewport: VIEWPORT,
        recordVideo: { dir: OUTPUT_DIRECTORY, size: VIEWPORT },
        storageState: {
            cookies: [],
            origins: [
                {
                    origin: GEOLIBRE_URL,
                    localStorage: [
                        {
                            name: "geolibre.desktopSettings",
                            value: JSON.stringify({
                                uiProfile: { onboarded: true },
                            }),
                        },
                    ],
                },
            ],
        },
    });
    await context.addInitScript(installOverlay);
    const page = await context.newPage();
    const webmPath = join(OUTPUT_DIRECTORY, `${name}.webm`);
    try {
        await script(createStudio(page));
    } finally {
        const videoPath = await page.video().path();
        await context.close();
        await browser.close();
        await rename(videoPath, webmPath);
    }
    return convertToMp4(webmPath);
}

async function convertToMp4(webmPath) {
    const mp4Path = webmPath.replace(/\.webm$/, ".mp4");
    try {
        execFileSync(
            "ffmpeg",
            [
                ...["-v", "error", "-y", "-i", webmPath],
                ...["-c:v", "libx264", "-preset", "slow", "-crf", "22"],
                ...["-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4Path],
            ],
            { stdio: "inherit" },
        );
        await rm(webmPath);
        return mp4Path;
    } catch {
        console.warn("ffmpeg isn't available; keeping the WebM recording.");
        return webmPath;
    }
}
