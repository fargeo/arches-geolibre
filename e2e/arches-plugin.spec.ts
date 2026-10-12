import { expect, test } from "@playwright/test";

import {
    ARCHES_TEST_URL,
    CONTRIBUTOR_USERNAME,
    EDITOR_USERNAME,
    addNodeToMap,
    archesPanel,
    drawSquareInEditSession,
    layerRow,
    openArchesPanel,
    signIn,
} from "./helpers.ts";

const EXTENT_LAYER_NAME = "GeoLibre Test Asset: Extent";

test("loads, signs in and lists the test model's geometry nodes", async ({
    page,
}) => {
    const failedArchesRequests: string[] = [];
    page.on("response", (response) => {
        if (response.url().startsWith(ARCHES_TEST_URL) && !response.ok()) {
            failedArchesRequests.push(`${response.status()} ${response.url()}`);
        }
    });
    await openArchesPanel(page);
    await signIn(page, EDITOR_USERNAME);

    const panel = archesPanel(page);
    const resourceModelGroup = panel
        .locator(".resource-model-group")
        .filter({ hasText: "GeoLibre Test Asset" });
    await expect(resourceModelGroup).toContainText("Location");
    await expect(resourceModelGroup).toContainText("Extent");
    await expect(panel.locator(".spatial-view-list")).toContainText(
        "geolibre_test_locations",
    );
    await expect(panel).not.toContainText("DEFAULT_BOUNDS");
    // GeoLibre reports every failed request to the user as an error.
    expect(failedArchesRequests).toEqual([]);
});

test("detects a GeoEditor session's new feature and pushes it to Arches", async ({
    page,
}) => {
    await openArchesPanel(page);
    await signIn(page, EDITOR_USERNAME);
    await addNodeToMap(page, "Extent");

    await drawSquareInEditSession(page, EXTENT_LAYER_NAME);

    // No click on "Check": the plugin should notice the session ended.
    const layerChanges = archesPanel(page)
        .locator(".layer-changes")
        .filter({ hasText: "Extent" });
    await expect(layerChanges).toContainText("0 edited, 1 new, 0 deleted");

    await layerChanges.getByRole("button", { name: "Push to Arches" }).click();
    await expect(archesPanel(page)).toContainText(
        "Saved 0 tile(s); created 1 resource(s).",
        { timeout: 120_000 },
    );
    await expect(layerRow(page, EXTENT_LAYER_NAME)).toHaveCount(1);
});

test("shows a selected feature's resource with a link into Arches", async ({
    page,
}) => {
    await openArchesPanel(page);
    await signIn(page, EDITOR_USERNAME);
    await addNodeToMap(page, "Extent");

    await layerRow(page, EXTENT_LAYER_NAME).click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page
        .getByRole("menuitem", { name: "Select by Expression..." })
        .click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("textarea").fill('["==", ["id"], 1]');
    await dialog.getByRole("button", { name: "Select features" }).click();

    const selectionSection = archesPanel(page).locator(".selection-section");
    await expect(selectionSection).toContainText("Selected resource");
    await expect(
        selectionSection.getByRole("button", { name: "Edit in Arches" }),
    ).toBeVisible();
});

test("lets a contributor attach a drawing to a found resource and see it awaiting review", async ({
    page,
}) => {
    await openArchesPanel(page);
    await signIn(page, CONTRIBUTOR_USERNAME);
    await expect(archesPanel(page)).toContainText(
        "Your edits will be saved as provisional",
    );
    await addNodeToMap(page, "Extent");
    await drawSquareInEditSession(page, EXTENT_LAYER_NAME);

    const layerChanges = archesPanel(page)
        .locator(".layer-changes")
        .filter({ hasText: "Extent" });
    await expect(layerChanges).toContainText("0 edited, 1 new, 0 deleted");
    await layerChanges.getByText("Existing resource").click();
    await layerChanges
        .getByRole("combobox", { name: "Search for a resource by name" })
        .fill("Mill");
    const firstSuggestion = page.getByRole("option").first();
    const resourceName = (await firstSuggestion.innerText()).trim();
    await firstSuggestion.click();
    await expect(layerChanges).toContainText(`Attach to ${resourceName}`);

    await layerChanges.getByRole("button", { name: "Push to Arches" }).click();
    await expect(layerChanges).toContainText("await review in Arches", {
        timeout: 120_000,
    });

    await expect(
        archesPanel(page).locator(".awaiting-review-section"),
    ).toContainText("waiting for a reviewer");
    await expect(layerRow(page, "Awaiting review (read only)")).toBeVisible();
});
