// Records demos of the plugin in GeoLibre's web build, into demo/:
//
//   editing          arches-geolibre-demo.mp4: add a layer, restyle it, find a
//                    resource with a filter expression, reshape and push it
//   resource-first   resource-first-editing.mp4: give resources with no
//                    geometry their first geometry, which tools built on
//                    spatial views can't do
//
// `npm run demo:record` records both; `npm run demo:record -- resource-first`
// records one. Needs the Arches test instance (test-instance/README.md) and
// GeoLibre's web build (docs/testing.md). The demos' edits really reach
// Arches, so they're undone afterwards.
//
//   ARCHES_TEST_URL       default http://localhost:8002
//   GEOLIBRE_DIR          GeoLibre checkout, default .geolibre
//   GEOLIBRE_PORT         preview port, default 4173
//   DEMO_RESOURCE_NAME    resource the editing demo reshapes, default "Kiln 24038"
//   DEMO_SKIP_BUILD=1     reuse the GeoLibre build as it is

import { recordEditingDemo } from "./demo/editing-demo.mjs";
import {
    buildGeoLibreWithPlugin,
    ensurePreviewServer,
    fetchEditorToken,
} from "./demo/harness.mjs";
import { recordResourceFirstDemo } from "./demo/resource-first-demo.mjs";

const DEMOS = {
    editing: recordEditingDemo,
    "resource-first": recordResourceFirstDemo,
};

const requestedDemos = process.argv.slice(2);
const demoNames =
    requestedDemos.length > 0 ? requestedDemos : Object.keys(DEMOS);
const unknownDemos = demoNames.filter((name) => !(name in DEMOS));
if (unknownDemos.length > 0) {
    throw new Error(
        `Unknown demo: ${unknownDemos.join(", ")}. Choose from ${Object.keys(DEMOS).join(", ")}.`,
    );
}

await fetchEditorToken();
if (process.env.DEMO_SKIP_BUILD !== "1") {
    await buildGeoLibreWithPlugin();
}
const previewServer = await ensurePreviewServer();
try {
    for (const name of demoNames) {
        console.log(`Demo saved to ${await DEMOS[name]()}`);
    }
} finally {
    if (previewServer) {
        process.kill(-previewServer.pid);
    }
}
