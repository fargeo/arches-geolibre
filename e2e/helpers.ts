import { expect, type Page } from "@playwright/test";

export const ARCHES_TEST_URL =
    process.env.ARCHES_TEST_URL ?? "http://localhost:8001";
export const EDITOR_USERNAME = "geolibre_editor";
export const CONTRIBUTOR_USERNAME = "geolibre_contributor";

const MINIMUM_DRAWING_ZOOM = 6;
const POINTER_SETTLE_MILLISECONDS = 150;
export const TEST_PASSWORD = "geolibre-test-password";

export function layerRow(page: Page, name: string) {
    return page.locator(`[data-testid="layer-row"][data-layer-name="${name}"]`);
}

export function archesPanel(page: Page) {
    return page.locator(".arches-panel");
}

/** A point on the map canvas, as fractions of its width and height. */
export async function canvasPoint(
    page: Page,
    fractionX: number,
    fractionY: number,
): Promise<{ x: number; y: number }> {
    const canvas = page.locator(".maplibregl-canvas").first();
    const box = (await canvas.boundingBox())!;
    return {
        x: box.x + box.width * fractionX,
        y: box.y + box.height * fractionY,
    };
}

export async function openArchesPanel(page: Page): Promise<void> {
    await page.goto("/");
    await page.getByRole("button", { name: "Plugins", exact: true }).click();
    await page.getByRole("menuitem", { name: /^Installed/ }).hover();
    await page.getByRole("menuitem", { name: /^Arches/ }).click();
    await page.keyboard.press("Escape");
    await expect(
        archesPanel(page).getByRole("heading", { name: "Arches connection" }),
    ).toBeVisible();
}

export async function signIn(page: Page, username: string): Promise<void> {
    const panel = archesPanel(page);
    await panel.getByLabel("Arches URL").fill(ARCHES_TEST_URL);
    await panel.getByLabel("Username").fill(username);
    await panel.getByPlaceholder("Password").fill(TEST_PASSWORD);
    await panel.getByRole("button", { name: "Sign in" }).click();
    await expect(
        panel.getByText(`Signed in to ${ARCHES_TEST_URL}`),
    ).toBeVisible();
}

export async function addNodeToMap(
    page: Page,
    nodeName: string,
): Promise<void> {
    const resourceModelGroup = archesPanel(page)
        .locator(".resource-model-group")
        .filter({ hasText: "GeoLibre Test Asset" });
    await resourceModelGroup
        .getByRole("button", { name: `Add ${nodeName} to the map` })
        .click();
    await expect(
        layerRow(page, `GeoLibre Test Asset: ${nodeName}`),
    ).toBeVisible({
        timeout: 120_000,
    });
}

/** Draws a square with the GeoEditor in an edit session on `layerName`. */
export async function drawSquareInEditSession(
    page: Page,
    layerName: string,
): Promise<void> {
    // Geoman can't draw on the zoomed-out globe; zoom in to the data first.
    const row = layerRow(page, layerName);
    await row.click();
    await row.getByRole("button", { name: "Zoom to layer" }).click();
    await waitForMapToSettle(page);
    await row.getByRole("button", { name: "Layer actions" }).click();
    await page
        .getByRole("menuitem", { name: "Edit geometry", exact: true })
        .click();

    const toolbar = page.locator(".geo-editor-toolbar");
    await expect(toolbar).toBeVisible();
    const expandToolbar = toolbar.locator('button[title="Expand toolbar"]');
    if (await expandToolbar.isVisible()) {
        await expandToolbar.click();
    }
    await toolbar.locator('button[data-mode="polygon"]').click();
    const corners = [
        await canvasPoint(page, 0.55, 0.35),
        await canvasPoint(page, 0.8, 0.35),
        await canvasPoint(page, 0.8, 0.65),
        await canvasPoint(page, 0.55, 0.65),
    ];
    // Geoman places vertices from mouse-move events, so glide to each corner
    // and let it catch up before clicking.
    for (const [index, corner] of corners.entries()) {
        await page.mouse.move(corner.x, corner.y, { steps: 8 });
        await page.waitForTimeout(POINTER_SETTLE_MILLISECONDS);
        if (index < corners.length - 1) {
            await page.mouse.click(corner.x, corner.y);
        } else {
            await page.mouse.dblclick(corner.x, corner.y);
        }
    }

    await row.getByRole("button", { name: "Layer actions" }).click();
    await page
        .getByRole("menuitem", { name: "Finish editing geometry", exact: true })
        .click();
}

/** The map zoom GeoLibre shows in its status bar. */
async function readMapZoom(page: Page): Promise<number> {
    const statusText = await page
        .getByText(/Zoom: [\d.]+/)
        .first()
        .innerText();
    return Number(/Zoom: ([\d.]+)/.exec(statusText)?.[1] ?? 0);
}

/**
 * Waits until the map is zoomed in and has stopped moving: clicks made while
 * the camera is still flying land in the wrong place, and Geoman can't draw
 * on the zoomed-out globe at all.
 */
async function waitForMapToSettle(page: Page): Promise<void> {
    let previousZoom = -1;
    await expect
        .poll(
            async () => {
                const zoom = await readMapZoom(page);
                const hasSettled =
                    zoom > MINIMUM_DRAWING_ZOOM && zoom === previousZoom;
                previousZoom = zoom;
                return hasSettled;
            },
            { intervals: [500] },
        )
        .toBe(true);
}
