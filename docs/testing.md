# Testing arches-geolibre

There are three automated layers plus a manual pass in GeoLibre Desktop. Each
covers something the others can't.

| Layer         | Command                    | Needs                                    | Covers                                                                                                                                         |
| ------------- | -------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit          | `npm test`                 | nothing                                  | diffing, feature keys, tile rebuilds, browser sign-in polling                                                                                  |
| Integration   | `npm run test:integration` | test Arches on :8002                     | browser and password sign-in, refresh, catalog, loading, every push path, permissions, against real Arches                                     |
| Browser (e2e) | `npm run test:e2e`         | test Arches on :8002, GeoLibre web build | plugin loading, panel UI, browser and password sign-in, adding a layer, a real GeoEditor session, edit-session detection, push                 |
| Manual        | see below                  | GeoLibre Desktop                         | `nativeFetch`, the OS keychain, browser sign-in opening the system browser, theme fit, edits too fiddly to script (vertex drags, split, merge) |

The browser suite runs GeoLibre's **web** build. In the web build there is no
`nativeFetch`, so requests to Arches are cross-origin and rely on the test
instance's CORS settings. Credentials go to `localStorage` rather than the
keychain. Those differences are why the desktop pass stays manual.

## One-time setup

1. Create the Arches test instance (see `test-instance/README.md`):

    ```shell
    test-instance/create-test-instance.sh ~/Projects/arches4/dev_env_82 ~/Projects/arches4
    ```

2. For the browser suite, build GeoLibre's web app with the plugin bundled
   in. This clones GeoLibre into `.geolibre/` (git-ignored) and takes a few
   minutes the first time:

    ```shell
    scripts/prepare-geolibre-web.sh          # GEOLIBRE_REF=v3.3.0 to test an older release
    npx playwright install chromium
    ```

    Re-run the script after changing the plugin, so the bundled copy is
    current.

## Running the suites

Start the test instance in one terminal:

```shell
cd ~/Projects/arches4/arches_geolibre_test_82
~/Projects/arches4/dev_env_82/bin/python manage.py runserver 8002
```

Then run:

```shell
npm test                  # unit
npm run test:integration  # needs :8002
npm run test:e2e          # needs :8002; starts GeoLibre's preview server on :4173 itself
```

`ARCHES_TEST_URL` points the integration and browser suites at a different
Arches. `GEOLIBRE_DIR` and `GEOLIBRE_PORT` relocate the GeoLibre build.

This branch targets Arches 8.2 with archesproject/arches#13011, #13012 and
#13013 in place. For released Arches 8.1, use the plugin's `main` branch and
its test instance.

## Testing in GeoLibre Desktop

1. Start the test instance on port 8002 (above).
2. Build the plugin and install it into GeoLibre Desktop's plugin folder:

    ```shell
    npm run install:geolibre
    ```

    This copies `geolibre-plugin/` to
    `~/Library/Application Support/org.geolibre.desktop/plugins/arches-geolibre/`.

3. Quit GeoLibre Desktop completely (⌘Q) and reopen it. Plugins are only
   scanned at startup.
4. Open **Plugins → Installed → Arches**. The Arches panel docks beside
   Layers.
5. Sign in with **Arches URL** `http://localhost:8002`:
    - **Sign in with browser** opens Arches in your browser. Sign in there,
      check the code matches the panel, and approve.
    - Or choose **Use a password instead**.
    - Either way, use `geolibre_editor` (`geolibre_contributor` to see
      provisional edits, `geolibre_viewer` for read only) with the password
      `geolibre-test-password`.
6. Work through the checklist in `docs/phase-0-spikes.md`, recording results
   there.
    - **Extent** (about 10,000 features) loads in a few seconds and is the
      better layer for editing tests. **Location** (about 55,000) takes
      around 11 seconds.
    - To edit, open the Arches layer's **⋯ Layer actions → Edit geometry**.
      Draw or change features with the GeoEditor toolbar, then **⋯ → Finish
      editing geometry** to save the session.
7. Check edits in Arches:
    - Reload the layer from the catalog.
    - Or use `/geojson?nodeid=<node id>&resourceid=<resource id>` with a
      signed-in session.
    - Or build the test project's frontend and open the resource in Arches.

To see the developer diagnostics section in the panel (host API probes,
map-tool events, raw properties of selected features), build with
`VITE_ARCHES_GEOLIBRE_DIAGNOSTICS=true npm run install:geolibre`.

After changing plugin code, repeat step 2 and restart GeoLibre. For a faster
loop, open **Manage Plugins → Settings → development directories** and add
this repo's `geolibre-plugin/` folder. Then `npm run watch` rebuilds on
save, and a GeoLibre restart picks the change up without reinstalling.

To check the session survives a restart, quit and reopen GeoLibre after
signing in. The panel should come back signed in, with its tokens read from
the macOS keychain.

## Editing checks in GeoLibre Desktop

The browser suite covers drawing, attaching by search, pushing and the
contributor overlay. These need a person:

1. **Vertex edits, split and merge.** As `geolibre_editor` on Extent, drag a
   vertex, split a polygon, merge two polygons, then save the session. Check
   the pending list, push, and confirm the result in Arches.
2. **Excluding a change.** Make two edits, untick one, and push. Only the
   ticked one should reach Arches, and the reloaded layer should show the
   unticked one back as it was.
3. **Map-pick attach.** Draw a feature, choose **Existing resource**, then
   select a feature of another resource on the map. Use **Use the selected
   feature** and push. The new geometry should join that resource.
4. **Deleting all of a resource's geometry.** As `geolibre_editor`, delete
   every Extent feature of one resource and push: the tile is deleted. As
   `geolibre_contributor`, do the same: the geometry is cleared as a
   provisional edit instead.
5. **Awaiting review.** As `geolibre_contributor`, edit an existing feature
   and push. The orange "Awaiting review (read only)" layer should show it.
   Approve the edit in Arches as `geolibre_editor`, then **Refresh**: the
   overlay should clear and the approved geometry appear after reloading the
   layer.
6. **Blocked changes.** As `geolibre_viewer`, edit a feature: the change
   should be unticked, unchangeable, and explained.

If you add test users after building the instance, reindex first (see
`test-instance/README.md`). Otherwise they won't see any resources.

## Recording the demo

`npm run demo:record` records two short videos of the plugin in GeoLibre's
web build, into the git-ignored `demo/` folder (as MP4, or WebM if `ffmpeg`
isn't installed):

- **`arches-geolibre-demo.mp4`** (`editing`):
    1. sign in;
    2. add the Extent layer and restyle it;
    3. find Kiln 24038 with Select by Expression and zoom to it;
    4. reshape its geometry;
    5. push the change.
- **`resource-first-editing.mp4`** (`resource-first`), the gap in tools built
  on spatial views, such as the Esri add-in and the QGIS plugin:
    1. show that Tannery 90001, which has no geometry, isn't in the spatial
       view;
    2. start a worklist from **Edit resources → Missing geometry**;
    3. draw the tannery's outline;
    4. use a surveyor's outline from a GeoJSON file
       (`e2e/fixtures/foundry-survey.geojson`) for Foundry 90002;
    5. push both, and watch the missing count drop.

`npm run demo:record -- resource-first` records just one.

- It needs the Arches test instance on :8002 and a GeoLibre checkout prepared
  as for the browser suite (`scripts/prepare-geolibre-web.sh`).
- It rebuilds the plugin into that checkout's web build and starts the preview
  server if it isn't running. Set `DEMO_SKIP_BUILD=1` to reuse the current
  build.
- The edits really reach Arches, so the script undoes them afterwards, even
  if the recording fails part-way.
- Set `DEMO_RESOURCE_NAME` to edit another Extent polygon. `ARCHES_TEST_URL`,
  `GEOLIBRE_DIR` and `GEOLIBRE_PORT` work as for the browser suite.
