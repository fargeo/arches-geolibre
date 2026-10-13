// Adding an Arches layer, restyling it, finding a resource with a filter
// expression, reshaping its geometry and pushing the change. The resource's
// geometry is restored afterwards.

import {
    ARCHES_URL,
    GEOLIBRE_URL,
    fetchEditorToken,
    recordVideo,
} from "./harness.mjs";

const RESOURCE_NAME = process.env.DEMO_RESOURCE_NAME ?? "Kiln 24038";
const EXTENT_NODE_ID = "893fe3f2-56ef-5dc6-90ec-5487aa9423c8";
const EXTENT_LAYER_NAME = "GeoLibre Test Asset: Extent";

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

async function restoreDemoResource(demoResource) {
    const response = await fetch(`${ARCHES_URL}/api/node_value/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${await fetchEditorToken()}` },
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

export async function recordEditingDemo() {
    const demoResource = await findDemoResource(await fetchEditorToken());
    try {
        return await recordVideo("arches-geolibre-demo", async (studio) => {
            const { page, panel, pause, caption } = studio;
            const { glideTo, glideAndClick, typeInto } = studio;
            await page.goto(GEOLIBRE_URL);
            await pause(1500);
            await studio.openPluginAndSignIn();

            await caption(
                "Add a geometry node from the Arches catalog as a layer",
            );
            await glideAndClick(
                panel.getByRole("button", { name: "Add Extent to the map" }),
            );
            const row = studio.layerRow(EXTENT_LAYER_NAME);
            await row.waitFor({ timeout: 120_000 });
            await pause(3000);

            await caption(
                "Make the Arches layer stand out with GeoLibre's Style panel",
            );
            await studio.openLayerAction(EXTENT_LAYER_NAME, "Open Style panel");
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
                await glideAndClick(numberInput);
                await numberInput.fill(value);
                await numberInput.press("Tab");
                await pause(500);
            }
            await pause(1000);
            await glideAndClick(
                page.getByRole("button", {
                    name: "Collapse style",
                    exact: true,
                }),
            );
            await pause(800);

            await caption(`Find ${RESOURCE_NAME} with a filter expression`);
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
                JSON.stringify(["==", ["get", "primary_name"], RESOURCE_NAME]),
                30,
            );
            await glideAndClick(
                dialog.getByRole("button", { name: "Select features" }),
            );
            await dialog
                .getByText(/1 of [\d,]+ feature\(s\) selected/)
                .waitFor();
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
            await glideAndClick(
                page.getByRole("menuitem", { name: "Zoom Out" }),
            );
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
            await studio.openLayerAction(EXTENT_LAYER_NAME, "Edit geometry");
            await pause(1000);
            const toolbar = page.locator(".geo-editor-toolbar");
            const expandToolbar = toolbar.locator(
                'button[title="Expand toolbar"]',
            );
            if (await expandToolbar.isVisible()) {
                await glideAndClick(expandToolbar);
            }
            await glideAndClick(toolbar.locator('button[data-mode="change"]'));
            await pause(800);
            const corner = await studio.screenPoint(
                demoResource.northEastCorner,
            );
            const mapArea = await studio.mapCanvas().boundingBox();
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
            await layerChanges
                .getByText("1 edited")
                .waitFor({ timeout: 30_000 });
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
        });
    } finally {
        await restoreDemoResource(demoResource);
    }
}
