import { expect, type Page } from "@playwright/test";

export const ARCHES_TEST_URL =
    process.env.ARCHES_TEST_URL ?? "http://localhost:8001";
export const EDITOR_USERNAME = "geolibre_editor";
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
    const nodeRow = archesPanel(page)
        .locator(".node-list li")
        .filter({ hasText: `GeoLibre Test Asset ${nodeName}` });
    await nodeRow.getByRole("button", { name: "Add" }).click();
    await expect(
        layerRow(page, `GeoLibre Test Asset: ${nodeName}`),
    ).toBeVisible({
        timeout: 120_000,
    });
}
