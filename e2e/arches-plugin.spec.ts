import { expect, test } from "@playwright/test";

import {
    EDITOR_USERNAME,
    addNodeToMap,
    archesPanel,
    canvasPoint,
    layerRow,
    openArchesPanel,
    signIn,
} from "./helpers.ts";

const EXTENT_LAYER_NAME = "GeoLibre Test Asset: Extent";

test("loads, signs in and lists the test model's geometry nodes", async ({
    page,
}) => {
    await openArchesPanel(page);
    await signIn(page, EDITOR_USERNAME);

    const nodeList = archesPanel(page).locator(".node-list");
    await expect(nodeList).toContainText("GeoLibre Test Asset Location");
    await expect(nodeList).toContainText("GeoLibre Test Asset Extent");
});

test("detects a GeoEditor session's new feature and pushes it to Arches", async ({
    page,
}) => {
    await openArchesPanel(page);
    await signIn(page, EDITOR_USERNAME);
    await addNodeToMap(page, "Extent");

    // Geoman can't draw on the zoomed-out globe; zoom in to the data first.
    const extentRow = layerRow(page, EXTENT_LAYER_NAME);
    await extentRow.click();
    await extentRow.getByRole("button", { name: "Zoom to layer" }).click();
    await extentRow.getByRole("button", { name: "Layer actions" }).click();
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
    await page.mouse.move(corners[0].x, corners[0].y);
    for (const corner of corners.slice(0, -1)) {
        await page.mouse.click(corner.x, corner.y);
    }
    await page.mouse.dblclick(corners[3].x, corners[3].y);

    await extentRow.getByRole("button", { name: "Layer actions" }).click();
    await page
        .getByRole("menuitem", { name: "Finish editing geometry", exact: true })
        .click();

    // No click on "Check": the plugin should notice the session ended.
    const pendingChanges = archesPanel(page)
        .locator("li")
        .filter({ hasText: "Extent" })
        .filter({ hasText: "edited" });
    await expect(pendingChanges).toContainText("0 edited, 1 new, 0 deleted");

    await pendingChanges
        .getByRole("button", { name: "Push to Arches" })
        .click();
    await expect(archesPanel(page)).toContainText(
        "Saved 0 tile(s); created 1 resource(s).",
        { timeout: 120_000 },
    );
    await expect(layerRow(page, EXTENT_LAYER_NAME)).toHaveCount(1);
});
