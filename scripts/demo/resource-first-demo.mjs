// Resource-first editing, answering the gap in the Esri add-in and the QGIS
// plugin: a resource with no geometry isn't in any spatial view, so tools
// built on spatial views can't find it to edit. Here the user starts from
// the resources instead, draws one record's location, uses a surveyor's
// outline for another, and pushes both. Both records are put back as they
// were afterwards.

import { join } from "node:path";

import {
    ARCHES_URL,
    GEOLIBRE_URL,
    REPOSITORY_ROOT,
    fetchEditorToken,
    recordVideo,
} from "./harness.mjs";

// Unlocated test resources (test-instance README) kept for this demo:
// 90001 has no Location tile, 90002 has an empty one.
const DRAWN_RESOURCE = "Tannery 90001";
const SURVEYED_RESOURCE = "Foundry 90002";
const LOCATION_NODE_ID = "c776e991-01ed-5781-b01e-5ee7950c23ff";
const GRAPH_ID = "45f4ab91-54cf-5e17-ba25-c12873c73385";
const SPATIAL_VIEW = "geolibre_test_locations";
const WORKLIST_LAYER_NAME = "GeoLibre Test Asset: Location (worklist)";
const SURVEY_FILE = join(
    REPOSITORY_ROOT,
    "e2e/fixtures/foundry-survey.geojson",
);
// The outline drawn for the tannery, as fractions of the map.
const TANNERY_OUTLINE = [
    [0.47, 0.42],
    [0.56, 0.4],
    [0.58, 0.55],
    [0.48, 0.57],
];

async function hasNoLocation(accessToken, name) {
    const query = new URLSearchParams({
        "paging-filter": "1",
        "resource-type-filter": JSON.stringify([
            { graphid: GRAPH_ID, inverted: false },
        ]),
        "advanced-search": JSON.stringify([
            { op: "and", [LOCATION_NODE_ID]: { op: "null", val: "" } },
        ]),
        "term-filter": JSON.stringify([
            {
                inverted: false,
                type: "string",
                context: "",
                context_label: "",
                id: name,
                text: name,
                value: name,
                selected: true,
            },
        ]),
    });
    const response = await fetch(`${ARCHES_URL}/search/resources?${query}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    const { results } = await response.json();
    return results.hits.hits.some((hit) => hit._source.displayname === name);
}

/** Records the geometry the plugin writes, so it can be undone. */
function recordGeometryWrites(page) {
    const writes = [];
    page.on("response", async (response) => {
        const request = response.request();
        if (
            request.method() !== "POST" ||
            response.url() !== `${ARCHES_URL}/api/node_value/` ||
            !response.ok()
        ) {
            return;
        }
        const body = new URLSearchParams(request.postData() ?? "");
        writes.push({
            tileId: (await response.json()).tileid,
            filledExistingTile: body.has("tileid"),
        });
    });
    return writes;
}

/** New tiles are deleted; tiles that were empty are emptied again. */
async function undoGeometryWrites(writes) {
    const headers = { Authorization: `Bearer ${await fetchEditorToken()}` };
    for (const write of writes) {
        const response = write.filledExistingTile
            ? await fetch(`${ARCHES_URL}/api/node_value/`, {
                  method: "POST",
                  headers,
                  body: new URLSearchParams({
                      nodeid: LOCATION_NODE_ID,
                      tileid: write.tileId,
                      data: JSON.stringify({
                          type: "FeatureCollection",
                          features: [],
                      }),
                      transaction_id: crypto.randomUUID(),
                  }),
              })
            : await fetch(`${ARCHES_URL}/api/tiles/${write.tileId}`, {
                  method: "DELETE",
                  headers,
              });
        console.log(
            `Undid a demo write to tile ${write.tileId} (HTTP ${response.status}).`,
        );
    }
}

export async function recordResourceFirstDemo() {
    const accessToken = await fetchEditorToken();
    for (const name of [DRAWN_RESOURCE, SURVEYED_RESOURCE]) {
        if (!(await hasNoLocation(accessToken, name))) {
            throw new Error(
                `${name} already has a Location; undo the last run or rebuild the test data.`,
            );
        }
    }
    let writes = [];
    try {
        return await recordVideo("resource-first-editing", async (studio) => {
            const { page, panel, pause, caption } = studio;
            const { glideTo, glideAndClick, typeInto } = studio;
            writes = recordGeometryWrites(page);
            await page.goto(GEOLIBRE_URL);
            await pause(1500);
            await studio.openPluginAndSignIn();

            await caption(
                "Tools built on spatial views, like the Esri add-in and the QGIS plugin, only see resources that already have geometry",
            );
            await glideAndClick(
                panel.getByRole("button", {
                    name: `Add ${SPATIAL_VIEW} to the map`,
                }),
            );
            await studio.layerRow(SPATIAL_VIEW).waitFor({ timeout: 120_000 });
            await pause(1500);

            await caption(
                `${DRAWN_RESOURCE} has no location yet, so it isn't in the view to edit`,
            );
            const editMenu = page.getByRole("button", {
                name: "Edit",
                exact: true,
            });
            await glideAndClick(editMenu);
            await glideAndClick(
                page.getByRole("menuitem", {
                    name: "Select by Expression...",
                }),
            );
            const dialog = page.getByRole("dialog");
            await typeInto(
                dialog.locator("textarea"),
                JSON.stringify(["==", ["get", "primary_name"], DRAWN_RESOURCE]),
                30,
            );
            await glideAndClick(
                dialog.getByRole("button", { name: "Select features" }),
            );
            await dialog
                .getByText(/0 of [\d,]+ feature\(s\) selected/)
                .waitFor();
            await pause(3000);
            await glideAndClick(dialog.getByRole("button", { name: "Close" }));
            // The view has made its point; hide it to keep the map clear.
            await glideAndClick(
                studio
                    .layerRow(SPATIAL_VIEW)
                    .getByRole("button", { name: "Hide layer" }),
            );

            await caption(
                "With the Arches plugin, start from the resources instead",
            );
            const section = panel.locator(".edit-resources-section");
            await glideAndClick(
                section.getByLabel("Model and geometry to edit"),
            );
            await glideAndClick(
                page.getByRole("option", {
                    name: "GeoLibre Test Asset: Location",
                }),
            );
            await glideAndClick(
                section.getByRole("button", { name: "Start a worklist" }),
            );
            const missingCount = section.getByText(
                /resources? ha(s|ve) no Location/,
            );
            await missingCount.waitFor({ timeout: 30_000 });
            await caption(
                "Arches finds every record with no location, which no spatial view can show",
            );
            await glideTo(missingCount);
            await pause(2500);

            await caption("Pick the records to map");
            const nameFilter = section.getByPlaceholder("Filter by name");
            for (const name of [DRAWN_RESOURCE, SURVEYED_RESOURCE]) {
                await nameFilter.fill("");
                await typeInto(nameFilter, name);
                await glideAndClick(
                    section.getByRole("button", {
                        name: `Add ${name} to the worklist`,
                    }),
                );
                await pause(800);
            }
            await nameFilter.fill("");
            await glideTo(section.locator(".worklist-entries"));
            await pause(2000);

            await caption(
                `Draw ${DRAWN_RESOURCE}: find the place, then draw on the worklist layer`,
            );
            await typeInto(
                page.getByPlaceholder(/Search layers, places/),
                "Bermondsey",
            );
            await pause(1500);
            await page.getByPlaceholder(/Search layers, places/).press("Enter");
            await pause(2500);
            const viewMenu = page.getByRole("button", {
                name: "View",
                exact: true,
            });
            for (let step = 0; step < 4; step += 1) {
                await glideAndClick(viewMenu);
                await glideAndClick(
                    page.getByRole("menuitem", { name: "Zoom In" }),
                );
                await pause(700);
            }
            await studio.openLayerAction(WORKLIST_LAYER_NAME, "Edit geometry");
            await pause(1000);
            await studio.drawPolygon(TANNERY_OUTLINE);
            await pause(800);
            await glideAndClick(
                studio
                    .layerRow(WORKLIST_LAYER_NAME)
                    .getByRole("button", { name: "Save", exact: true }),
            );
            const worklistChanges = panel
                .locator(".layer-changes")
                .filter({ hasText: "(worklist)" });
            const attachedToTannery = worklistChanges.getByText(
                `Attach to ${DRAWN_RESOURCE}`,
            );
            await attachedToTannery.waitFor({ timeout: 30_000 });
            await caption(
                `What you draw goes to the record you're working on: ${DRAWN_RESOURCE}`,
            );
            await glideTo(attachedToTannery);
            await pause(2500);

            await caption(
                `Next, ${SURVEYED_RESOURCE}: use a surveyor's outline from another layer`,
            );
            await glideAndClick(
                section.getByRole("button", { name: "Next", exact: true }),
            );
            await pause(1000);
            await glideAndClick(
                page.getByRole("button", { name: "Add Data", exact: true }),
            );
            await glideAndClick(
                page.getByRole("menuitem", { name: "Vector Layer" }),
            );
            const fileChooserPromise = page.waitForEvent("filechooser");
            await glideAndClick(page.getByText("Drop file or click to browse"));
            await (await fileChooserPromise).setFiles(SURVEY_FILE);
            await studio.layerRow("foundry-survey").waitFor();
            await pause(2000);
            await glideAndClick(
                page
                    .locator(".vector-control-content")
                    .locator("..")
                    .getByRole("button", { name: /close|×/i })
                    .first(),
            );
            const surveyRow = studio.layerRow("foundry-survey");
            await glideAndClick(
                surveyRow.getByRole("button", { name: "Layer actions" }),
            );
            await page
                .getByRole("menuitem", { name: "Select features" })
                .hover();
            await glideAndClick(
                page.getByRole("menuitem", {
                    name: "Select features by click",
                }),
            );
            // Adding the file zooms the map to it, so the outline is in the middle.
            const surveyCentre = await studio.mapPoint(0.5, 0.5);
            await page.mouse.move(surveyCentre.x, surveyCentre.y, {
                steps: 25,
            });
            await page.mouse.click(surveyCentre.x, surveyCentre.y);
            await pause(1200);
            await glideAndClick(
                section.getByRole("button", {
                    name: "Use the selected feature",
                }),
            );
            await section
                .getByText(
                    `Copied 1 feature as ${SURVEYED_RESOURCE}'s geometry.`,
                )
                .waitFor();
            await pause(2500);

            await caption("Push both to Arches");
            await glideAndClick(
                worklistChanges.getByRole("button", { name: "Push to Arches" }),
            );
            await panel.getByText(/Saved 2 tile/).waitFor({ timeout: 60_000 });
            await glideTo(section.locator(".worklist-entries"));
            await pause(2500);

            await caption(
                "Both records now have a location in Arches, and will appear in the spatial view",
            );
            await glideAndClick(
                section.getByRole("button", { name: "Search", exact: true }),
            );
            await glideAndClick(
                section.getByRole("button", {
                    name: "Missing geometry",
                    exact: true,
                }),
            );
            await missingCount.waitFor();
            await glideTo(missingCount);
            await pause(3500);
        });
    } finally {
        await undoGeometryWrites(writes);
    }
}
