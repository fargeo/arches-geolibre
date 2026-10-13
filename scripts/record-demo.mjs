// Records a short demo of the plugin in GeoLibre's web build: sign in, add an
// Arches layer, restyle it, find a resource with a filter expression, reshape
// its geometry and push the change. Needs the Arches test instance (see
// test-instance/README.md) and GeoLibre's web build (see docs/testing.md).
// The edit really reaches Arches, so the resource's geometry is restored at
// the end. Writes demo/arches-geolibre-demo.mp4 (or .webm without ffmpeg).
//
//   ARCHES_TEST_URL       default http://localhost:8002
//   GEOLIBRE_DIR          GeoLibre checkout, default .geolibre
//   GEOLIBRE_PORT         preview port, default 4173
//   DEMO_RESOURCE_NAME    resource to edit, default "Kiln 24038"
//   DEMO_SKIP_BUILD=1     reuse the GeoLibre build as it is

import { execFileSync, spawn } from "node:child_process";
import { cp, mkdir, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const REPOSITORY_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUTPUT_DIRECTORY = join(REPOSITORY_ROOT, "demo");
const ARCHES_URL = process.env.ARCHES_TEST_URL ?? "http://localhost:8002";
const GEOLIBRE_DIR = resolve(
    REPOSITORY_ROOT,
    process.env.GEOLIBRE_DIR ?? ".geolibre",
);
const GEOLIBRE_PORT = Number(process.env.GEOLIBRE_PORT ?? 4173);
const GEOLIBRE_URL = `http://localhost:${GEOLIBRE_PORT}`;
const RESOURCE_NAME = process.env.DEMO_RESOURCE_NAME ?? "Kiln 24038";

// Matches test-instance/geolibre_test_support/constants.py.
const EXTENT_NODE_ID = "893fe3f2-56ef-5dc6-90ec-5487aa9423c8";
const EXTENT_LAYER_NAME = "GeoLibre Test Asset: Extent";
const PASSWORD_CLIENT_ID = "arches-geolibre-test";
const EDITOR_USERNAME = "geolibre_editor";
const TEST_PASSWORD = "geolibre-test-password";
const VIEWPORT = { width: 1440, height: 900 };

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

async function fetchEditorToken() {
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

/** The demo resource's Extent tile, so it can be restored afterwards. */
async function findDemoResource(accessToken) {
    const query = new URLSearchParams({
        nodeid: EXTENT_NODE_ID,
        include_primary_name: "true",
    });
    const response = await fetch(`${ARCHES_URL}/geojson?${query}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    const { features } = await response.json();
    const feature = features.find(
        (candidate) => candidate.properties.primary_name === RESOURCE_NAME,
    );
    if (!feature || feature.geometry.type !== "Polygon") {
        throw new Error(
            `No polygon Extent named "${RESOURCE_NAME}" in Arches.`,
        );
    }
    const tileId = feature.properties.tileid;
    const tileResponse = await fetch(`${ARCHES_URL}/api/tiles/${tileId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    const tile = await tileResponse.json();
    const corners = feature.geometry.coordinates[0];
    return {
        tileId,
        originalValue: tile.data[EXTENT_NODE_ID],
        northEastCorner: {
            longitude: Math.max(...corners.map(([longitude]) => longitude)),
            latitude: Math.max(...corners.map(([, latitude]) => latitude)),
        },
    };
}

async function restoreDemoResource(accessToken, demoResource) {
    const response = await fetch(`${ARCHES_URL}/api/node_value/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: new URLSearchParams({
            nodeid: EXTENT_NODE_ID,
            tileid: demoResource.tileId,
            data: JSON.stringify(demoResource.originalValue),
            transaction_id: crypto.randomUUID(),
        }),
    });
    console.log(
        `Restored ${RESOURCE_NAME}'s geometry in Arches (HTTP ${response.status}).`,
    );
}

function buildGeoLibreWithPlugin() {
    execFileSync("npm", ["run", "build"], {
        cwd: REPOSITORY_ROOT,
        stdio: "inherit",
    });
    const bundledPluginDirectory = join(
        GEOLIBRE_DIR,
        "apps/geolibre-desktop/public/plugins/arches-geolibre",
    );
    return rm(bundledPluginDirectory, { recursive: true, force: true })
        .then(() =>
            cp(
                join(REPOSITORY_ROOT, "geolibre-plugin"),
                bundledPluginDirectory,
                {
                    recursive: true,
                },
            ),
        )
        .then(() =>
            execFileSync("npm", ["run", "build"], {
                cwd: GEOLIBRE_DIR,
                stdio: "inherit",
            }),
        );
}

async function isReachable(url) {
    try {
        return (await fetch(url)).ok;
    } catch {
        return false;
    }
}

/** Starts GeoLibre's preview server unless one is already running. */
async function ensurePreviewServer() {
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

async function recordDemo(demoResource) {
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

    const caption = (text) =>
        page.evaluate((value) => window.showCaption(value), text);
    const pause = (milliseconds) => page.waitForTimeout(milliseconds);

    async function glideTo(locator) {
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

    async function screenPoint({ longitude, latitude }) {
        const [west, south, east, north] = await mapBounds();
        const canvas = await page
            .locator(".maplibregl-canvas")
            .first()
            .boundingBox();
        return {
            x: canvas.x + ((longitude - west) / (east - west)) * canvas.width,
            y:
                canvas.y +
                ((mercatorY(north) - mercatorY(latitude)) /
                    (mercatorY(north) - mercatorY(south))) *
                    canvas.height,
        };
    }

    try {
        await page.goto(GEOLIBRE_URL);
        await pause(1500);
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

        await caption("Add a geometry node from the Arches catalog as a layer");
        await glideAndClick(
            panel.getByRole("button", { name: "Add Extent to the map" }),
        );
        const row = page.locator(
            `[data-testid="layer-row"][data-layer-name="${EXTENT_LAYER_NAME}"]`,
        );
        await row.waitFor({ timeout: 120_000 });
        await pause(3000);

        await caption(
            "Make the Arches layer stand out with GeoLibre's Style panel",
        );
        await glideAndClick(row.getByRole("button", { name: "Layer actions" }));
        await glideAndClick(
            page.getByRole("menuitem", { name: "Open Style panel" }),
        );
        await pause(1000);
        for (const [label, color] of [
            ["Fill color", "#f97316"],
            ["Outline color", "#7c2d12"],
        ]) {
            const colorInput = page.getByLabel(label, { exact: true });
            await glideTo(colorInput);
            await colorInput.fill(color);
            await pause(700);
        }
        for (const [label, value] of [
            ["Stroke width", "2"],
            ["Fill opacity", "0.6"],
        ]) {
            const numberInput = page.getByLabel(label, { exact: true });
            await numberInput.scrollIntoViewIfNeeded();
            await glideAndClick(numberInput);
            await numberInput.fill(value);
            await numberInput.press("Tab");
            await pause(500);
        }
        await pause(1000);
        await glideAndClick(
            page.getByRole("button", { name: "Collapse style", exact: true }),
        );
        await pause(800);

        await caption(`Find ${RESOURCE_NAME} with a filter expression`);
        const editMenu = page.getByRole("button", {
            name: "Edit",
            exact: true,
        });
        await glideAndClick(editMenu);
        await glideAndClick(
            page.getByRole("menuitem", { name: "Select by Expression..." }),
        );
        const dialog = page.getByRole("dialog");
        await typeInto(
            dialog.locator("textarea"),
            JSON.stringify(["==", ["get", "primary_name"], RESOURCE_NAME]),
            30,
        );
        await glideAndClick(
            dialog.getByRole("button", { name: "Select features" }),
        );
        await dialog.getByText(/1 of [\d,]+ feature\(s\) selected/).waitFor();
        await pause(1500);
        await glideAndClick(dialog.getByRole("button", { name: "Close" }));
        await glideAndClick(editMenu);
        await glideAndClick(
            page.getByRole("menuitem", { name: "Zoom to Selection" }),
        );
        await pause(1500);
        // Zoom to Selection fits the feature edge to edge; step out so its
        // corner can be dragged without leaving the map.
        await glideAndClick(
            page.getByRole("button", { name: "View", exact: true }),
        );
        await glideAndClick(page.getByRole("menuitem", { name: "Zoom Out" }));
        await pause(2000);

        await caption(
            "The plugin shows the selected resource, with links into Arches",
        );
        await glideTo(panel.locator(".selection-section"));
        await pause(2500);
        await glideAndClick(editMenu);
        await glideAndClick(
            page.getByRole("menuitem", { name: "Clear Selection" }),
        );
        await pause(800);

        await caption("Reshape its geometry with GeoLibre's editor");
        await glideAndClick(row.getByRole("button", { name: "Layer actions" }));
        await glideAndClick(
            page.getByRole("menuitem", { name: "Edit geometry", exact: true }),
        );
        await pause(1000);
        const toolbar = page.locator(".geo-editor-toolbar");
        const expandToolbar = toolbar.locator('button[title="Expand toolbar"]');
        if (await expandToolbar.isVisible()) {
            await glideAndClick(expandToolbar);
        }
        await glideAndClick(toolbar.locator('button[data-mode="change"]'));
        await pause(800);
        const corner = await screenPoint(demoResource.northEastCorner);
        const mapArea = await page
            .locator(".maplibregl-canvas")
            .first()
            .boundingBox();
        await page.mouse.move(corner.x, corner.y, { steps: 30 });
        await pause(600);
        await page.mouse.down();
        await page.mouse.move(
            Math.min(corner.x + 70, mapArea.x + mapArea.width - 40),
            Math.max(corner.y - 50, mapArea.y + 40),
            { steps: 40 },
        );
        await pause(300);
        await page.mouse.up();
        await pause(1500);
        await glideAndClick(
            row.getByRole("button", { name: "Save", exact: true }),
        );
        await pause(1000);

        await caption(
            "The plugin picks up the edit as a pending change to the resource",
        );
        const layerChanges = panel
            .locator(".layer-changes")
            .filter({ hasText: "Extent" });
        await layerChanges.getByText("1 edited").waitFor({ timeout: 30_000 });
        await glideTo(layerChanges.getByText(RESOURCE_NAME));
        await pause(2500);

        await caption(
            "Push it to Arches, checking first that nobody else changed it",
        );
        await glideAndClick(
            layerChanges.getByRole("button", { name: "Push to Arches" }),
        );
        await panel.getByText(/Saved 1 tile/).waitFor({ timeout: 60_000 });
        await pause(2500);

        await caption(
            "Saved in Arches. Edits by non-reviewers wait for review.",
        );
        await pause(3000);
    } finally {
        const videoPath = await page.video().path();
        await context.close();
        await browser.close();
        await rename(
            videoPath,
            join(OUTPUT_DIRECTORY, "arches-geolibre-demo.webm"),
        );
    }
}

function convertToMp4() {
    const webmPath = join(OUTPUT_DIRECTORY, "arches-geolibre-demo.webm");
    const mp4Path = join(OUTPUT_DIRECTORY, "arches-geolibre-demo.mp4");
    try {
        execFileSync(
            "ffmpeg",
            [
                "-v",
                "error",
                "-y",
                "-i",
                webmPath,
                "-c:v",
                "libx264",
                "-preset",
                "slow",
                "-crf",
                "22",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                mp4Path,
            ],
            { stdio: "inherit" },
        );
        return rm(webmPath).then(() => mp4Path);
    } catch {
        console.warn("ffmpeg isn't available; keeping the WebM recording.");
        return Promise.resolve(webmPath);
    }
}

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
const accessToken = await fetchEditorToken();
const demoResource = await findDemoResource(accessToken);
if (process.env.DEMO_SKIP_BUILD !== "1") {
    await buildGeoLibreWithPlugin();
}
const previewServer = await ensurePreviewServer();
try {
    await recordDemo(demoResource);
} finally {
    await restoreDemoResource(await fetchEditorToken(), demoResource);
    if (previewServer) {
        process.kill(-previewServer.pid);
    }
}
console.log(`Demo saved to ${await convertToMp4()}`);
