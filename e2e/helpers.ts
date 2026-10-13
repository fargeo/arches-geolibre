import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const ARCHES_TEST_URL =
    process.env.ARCHES_TEST_URL ?? "http://localhost:8002";
export const EDITOR_USERNAME = "geolibre_editor";
export const CONTRIBUTOR_USERNAME = "geolibre_contributor";

const MINIMUM_DRAWING_ZOOM = 6;
const POINTER_SETTLE_MILLISECONDS = 150;
export const TEST_PASSWORD = "geolibre-test-password";

const PASSWORD_CLIENT_ID = "arches-geolibre-test";

/** Records the resources the plugin creates, so a test can delete them. */
export function recordCreatedResources(page: Page): string[] {
    const createdResourceIds: string[] = [];
    page.on("response", async (response) => {
        const request = response.request();
        if (
            request.method() === "POST" &&
            response.url() === `${ARCHES_TEST_URL}/api/node_value/` &&
            !new URLSearchParams(request.postData() ?? "").has(
                "resourceinstanceid",
            ) &&
            response.ok()
        ) {
            const savedTile = await response.json();
            createdResourceIds.push(savedTile.resourceinstance_id);
        }
    });
    return createdResourceIds;
}

export async function deleteResources(
    request: APIRequestContext,
    resourceIds: string[],
): Promise<void> {
    const tokenResponse = await request.post(`${ARCHES_TEST_URL}/o/token/`, {
        form: {
            grant_type: "password",
            client_id: PASSWORD_CLIENT_ID,
            username: EDITOR_USERNAME,
            password: TEST_PASSWORD,
        },
    });
    const { access_token: accessToken } = await tokenResponse.json();
    for (const resourceId of resourceIds) {
        await request.delete(`${ARCHES_TEST_URL}/resources/${resourceId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
    }
}

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

// Central London, zoomed in far enough for GeoEditor to draw.
const TEST_AREA_URL = "/?lat=51.505&lon=-0.125&zoom=14";

export async function openArchesPanel(page: Page): Promise<void> {
    await page.goto(TEST_AREA_URL);
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
    await panel.getByRole("button", { name: "Use a password instead" }).click();
    await panel.getByLabel("Username").fill(username);
    await panel.getByPlaceholder("Password").fill(TEST_PASSWORD);
    await panel.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
        panel.getByText(`Signed in to ${ARCHES_TEST_URL}`),
    ).toBeVisible();
}

/** Signs in through Arches' code page, which GeoLibre opens in a new tab. */
export async function signInWithBrowser(
    page: Page,
    username: string,
): Promise<void> {
    const panel = archesPanel(page);
    await panel.getByLabel("Arches URL").fill(ARCHES_TEST_URL);
    const codePagePromise = page.context().waitForEvent("page");
    await panel.getByRole("button", { name: "Sign in with browser" }).click();
    const userCode = await panel.locator(".user-code").textContent();

    const codePage = await codePagePromise;
    await codePage.locator("input[name=username]").fill(username);
    await codePage.getByRole("button", { name: "Continue" }).click();
    await codePage.locator("input[name=password]").fill(TEST_PASSWORD);
    await codePage.locator("input[name=password]").press("Enter");
    await expect(codePage.locator("input[name=user_code]")).toHaveValue(
        userCode!,
    );
    await codePage.locator("input[name=user_code]").press("Enter");
    await codePage.locator("[name=action][value=accept]").click();
    await codePage.close();

    await expect(
        panel.getByText(`Signed in to ${ARCHES_TEST_URL}`),
    ).toBeVisible({ timeout: 15_000 });
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
