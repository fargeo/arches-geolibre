import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import {
    EDITOR_USERNAME,
    WORKLIST_LAYER_NAME,
    addMissingResource,
    addVectorFile,
    archesPanel,
    canvasPoint,
    drawSquareInEditSession,
    editResourcesSection,
    layerRow,
    openArchesPanel,
    recordGeometryWrites,
    signIn,
    startLocationWorklist,
    undoGeometryWrites,
} from "./helpers.ts";

// Unlocated test resources kept for this suite (test-instance README): 90291
// has no Location tile; 90292 has an empty one, which the push must fill.
const NO_LOCATION_TILE = "Brewery 90291";
const EMPTY_LOCATION_TILE = "Brewery 90292";
const SURVEY_FILE = fileURLToPath(
    new URL("./fixtures/foundry-survey.geojson", import.meta.url),
);

function worklistChanges(page: Parameters<typeof archesPanel>[0]) {
    return archesPanel(page)
        .locator(".layer-changes")
        .filter({ hasText: "(worklist)" });
}

test("gives a resource with no geometry its first geometry by drawing it", async ({
    page,
    request,
}) => {
    const writes = recordGeometryWrites(page);
    try {
        await openArchesPanel(page);
        await signIn(page, EDITOR_USERNAME);
        await startLocationWorklist(page);
        await addMissingResource(page, NO_LOCATION_TILE);

        const section = editResourcesSection(page);
        await expect(section.locator(".current-resource")).toContainText(
            "It has no Location yet",
        );
        await drawSquareInEditSession(page, WORKLIST_LAYER_NAME);

        const changes = worklistChanges(page);
        await expect(changes).toContainText("0 edited, 1 new, 0 deleted");
        await expect(changes).toContainText(`Attach to ${NO_LOCATION_TILE}`);
        await expect(section.locator(".worklist-entries")).toContainText(
            "Ready to push",
        );

        await changes.getByRole("button", { name: "Push to Arches" }).click();
        await expect(archesPanel(page)).toContainText("Saved 1 tile(s)", {
            timeout: 60_000,
        });
        await expect(section.locator(".worklist-entries")).toContainText(
            "Saved",
        );
    } finally {
        await undoGeometryWrites(request, writes);
    }
});

test("opens the editor on the worklist layer from Draw geometry", async ({
    page,
}) => {
    await openArchesPanel(page);
    await signIn(page, EDITOR_USERNAME);
    await startLocationWorklist(page);
    await addMissingResource(page, NO_LOCATION_TILE);

    const drawGeometry = editResourcesSection(page).getByRole("button", {
        name: "Draw geometry",
    });
    test.skip(
        (await drawGeometry.count()) === 0,
        "Needs GeoLibre's startEditSession (opengeos/GeoLibre#3138).",
    );
    await drawGeometry.click();

    await expect(page.locator(".geo-editor-toolbar")).toBeVisible();
    const row = layerRow(page, WORKLIST_LAYER_NAME);
    await row.getByRole("button", { name: "Layer actions" }).click();
    await page
        .getByRole("menuitem", { name: "Finish editing geometry", exact: true })
        .click();
});

test("uses a surveyed outline from another layer as a resource's geometry", async ({
    page,
    request,
}) => {
    const writes = recordGeometryWrites(page);
    try {
        await openArchesPanel(page);
        await signIn(page, EDITOR_USERNAME);
        await startLocationWorklist(page);
        await addMissingResource(page, EMPTY_LOCATION_TILE);

        await addVectorFile(page, SURVEY_FILE);
        const surveyRow = layerRow(page, "foundry-survey");
        await expect(surveyRow).toHaveCount(1);
        await surveyRow.getByRole("button", { name: "Layer actions" }).click();
        await page.getByRole("menuitem", { name: "Select features" }).hover();
        await page
            .getByRole("menuitem", { name: "Select features by click" })
            .click();
        // Adding the file zooms the map to it, so the outline is in the middle.
        const surveyCentre = await canvasPoint(page, 0.5, 0.5);
        await page.mouse.click(surveyCentre.x, surveyCentre.y);

        const section = editResourcesSection(page);
        await section
            .getByRole("button", { name: "Use the selected feature" })
            .click();
        await expect(section).toContainText(
            `Copied 1 feature as ${EMPTY_LOCATION_TILE}'s geometry.`,
        );

        const changes = worklistChanges(page);
        await expect(changes).toContainText(`Attach to ${EMPTY_LOCATION_TILE}`);
        await changes.getByRole("button", { name: "Push to Arches" }).click();
        await expect(archesPanel(page)).toContainText("Saved 1 tile(s)", {
            timeout: 60_000,
        });
        expect(writes).toEqual([
            expect.objectContaining({ filledExistingTile: true }),
        ]);
    } finally {
        await undoGeometryWrites(request, writes);
    }
});

test("finds a resource by name and zooms to the geometry it already has", async ({
    page,
}) => {
    await openArchesPanel(page);
    await signIn(page, EDITOR_USERNAME);
    await startLocationWorklist(page);

    const section = editResourcesSection(page);
    await section.getByRole("button", { name: "Search", exact: true }).click();
    await section.getByPlaceholder("Search by name").fill("Kiln 24038");
    const result = section.locator("li").filter({ hasText: "Kiln 24038" });
    await expect(result).toContainText("Has geometry");
    await result
        .getByRole("button", { name: "Add Kiln 24038 to the worklist" })
        .click();

    await expect(section.locator(".worklist-entries")).toContainText(
        "Has geometry",
    );
    await section.getByRole("button", { name: "Zoom to" }).click();
    await expect(page.getByText(/Zoom: 1[5-9]/)).toBeVisible();
});
