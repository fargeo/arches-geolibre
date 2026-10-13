# Phase 0 spikes

> A record of the early spikes, run against Arches 8.1. The plugin now needs
> Arches 8.2 ([arches-compatibility.md](arches-compatibility.md)), so the 8.1
> limits noted here no longer apply.

Tested against GeoLibre source 3.4.0 (`opengeos/GeoLibre@70bbe20`). The
installed desktop app is 3.3.0. Arches checks were against `dev/8.1.x`.

| #   | Spike                                          | Status                                                                                                               |
| --- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | Scaffold, build, install                       | Done. Loads in GeoLibre 3.4.0 web (automated); Desktop load is a manual check.                                       |
| 2   | Feature properties through a GeoEditor session | **Confirmed in GeoLibre 3.4.0 web**: properties, keys and `id` survive. Split/merge still manual.                    |
| 3   | Refreshing a layer after a push                | Reload-and-replace works in the browser suite. Desktop check pending.                                                |
| 4   | Vue 3 + OpenVue in a panel                     | **Done.** Two fixes needed (Options API, no cascade layer); light and dark verified.                                 |
| 5   | Sign-in                                        | Password grant **verified** (integration + browser suites). Device grant blocked on 8.1. Keychain is a manual check. |
| 6   | Spatial views as an edit source                | Answered from source: API path only.                                                                                 |
| 7   | Synthetic 50k dataset                          | **Done.** `test-instance/`: 50,000 resources, 55,032 Location and 10,122 Extent features.                            |

Automated coverage is described in [testing.md](testing.md): unit, integration
against the test instance, and Playwright in GeoLibre's web build.

## Findings

### 1. Loading

- External plugins load from
  `~/Library/Application Support/org.geolibre.desktop/plugins/<id>/`.
  `npm run install:geolibre` builds and copies the bundle there; restart
  GeoLibre after each install. There is no hot reload.
- Manage Plugins can also add a development directory. Changes there apply
  without copying, but a restart is still needed to pick up a new bundle.
- The exported `id`, `name` and `version` must match `plugin.json` exactly.

### 2. GeoEditor and feature identity

- **Vertex edits, reshape, rotate and scale** keep each feature's properties
  and `id`. GeoEditor snapshots them when the session starts and restores
  them on save.
- **Deleted features** are simply absent after the save.
- **Freshly drawn features** get a numeric-string `id` and no Arches
  properties.
- **Split and copy:** every piece keeps the source's full properties,
  including `arches_feature_key`. Only one piece keeps the original `id`.
    - The diff treats the extra pieces as new features _on the source tile_.
      Their `tileid` is copied, so they are appended to that tile rather than
      creating new resources.
    - Duplicate keys left in the layer mean it can't be re-baselined in place
      after a push. It has to be reloaded from Arches (see 3).
- **Merge/union** is unverified. It depends on the `maplibre-gl-geo-editor`
  library. Expect one input to keep its identity and the others to diff as
  deleted.
- Editor tracking fields are only stamped if the user turns tracking on for
  the layer. `addGeoJsonLayer` leaves it off.
- `getLayerFeatures` returns the store's data. It is clean after a save, and
  still pre-edit while a session is open.
- **No session-end event:** `onActiveMapToolChange` reports `"geo-editor"`
  whenever the GeoEditor plugin is on, not per session.
    - GeoEditor hides the edited layer for the length of a session, so
      `useEditSessionEnd` polls `listLayers()` visibility and re-checks a layer
      when it becomes visible again.
    - The manual **Check** button is the fallback.
- Any layer added with `addGeoJsonLayer` is editable, and there is no
  read-only flag. A read-only layer would have to be a plugin-owned external
  native layer (`registerExternalNativeLayer` with a custom `sourceKind`).
  That needs Phase 2 work, so for now read-only layers just have
  **Push to Arches** disabled.

- **Confirmed in GeoLibre 3.4.0's web build** (browser suite and a logged
  sample):
    - After a session that changed nothing, every feature came back with the
      same properties, `arches_feature_key`, `featureid` and `id`.
    - **But every geometry was rewritten with its keys in another order**
      (`{type, coordinates}`). A `JSON.stringify` comparison reported all
      10,122 features as edited. The diff now compares canonically, and a
      unit test covers it.
    - **A drawn polygon is saved as a `MultiPolygon`.** Arches splits
      multipart geometries into single parts on save, so this is harmless,
      but a drawn feature can come back as several.
    - The edit-session-end detection works: the pending-change counts
      appeared without clicking **Check**.
    - Geoman can't draw on the zoomed-out globe. Users (and the tests) must
      zoom in first.

### 3. Refreshing a layer

- `addGeoJsonLayer` always creates a new layer; it does not deduplicate by
  `sourcePath`.
- Calling `getMap().getSource(id).setData()` does not update the store. The
  edit is lost on the next source rebuild, the next GeoEditor session or a
  project save. Don't use it.
- The plugin API has no `removeLayer`. In 3.4.0,
  `unregisterExternalNativeLayer(id)` removes _any_ layer. This is
  undocumented, so it is isolated in `reloadArchesLayer` and must be
  re-checked on GeoLibre upgrades.
- **Current approach:** after a push, add a fresh layer loaded from Arches and
  remove the old one with that call.
- **Better long-term options:**
    - a plugin-owned external native layer, which re-registers in place under
      the same id
    - Option B upstream (`updateLayerData` / `removeLayer`)
- Plugin-added GeoJSON is embedded in the project file. An `arches://…`
  `sourcePath` is only a label, so it's safe to use. An `http(s)` URL would
  make GeoLibre treat the layer as refreshable and overwrite edits.

### 4. Vue 3 + OpenVue

Verified in GeoLibre 3.4.0's web build with Playwright.

- The bundle is 437 KB (92 KB gzipped) with Vue, the OpenVue components used
  so far, and the Aura preset.
- Panels render into a plain `div` in the main document; there is no shadow
  DOM. GeoLibre uses Tailwind v4, and plugin CSS is injected as a global
  `<style>`.
- **OpenVue needs Vue's Options API.** Its base component is written with
  it. With `__VUE_OPTIONS_API__` turned off to save bytes, every OpenVue
  component failed with `e.cx is not a function` and rendered nothing.
- **OpenVue's styles must not go in a CSS cascade layer.** An unlayered rule
  beats any layered rule whatever its specificity, so GeoLibre's element
  resets zeroed OpenVue's padding and borders. Unlayered, OpenVue's
  `.p-*` class selectors win on specificity, the usual PrimeVue + Tailwind
  arrangement.
- Configured with the prefix `arches-geolibre`, so OpenVue's CSS variables
  don't collide, and `darkModeSelector: ".dark"`, the class GeoLibre toggles
  on `<html>`.
- Inputs and buttons render correctly in both light and dark themes.
    - Aura's default green primary colour clashes with GeoLibre's blue. Theme
      it to match in Phase 2.
- Still to check by eye in Desktop: spacing and typography next to GeoLibre's
  own panels.

### 5. Sign-in

- **The device authorization grant needs django-oauth-toolkit 3.2.0 or later.**
  Arches pins 3.0.1, which has no device endpoints, so device sign-in is not
  possible on 8.1 without a dependency bump. The plan is corrected.
- For now the password grant is implemented, the same flow as the QGIS and
  ArcGIS Pro add-ins: `/auth/get_client_id`, then `/o/token/`, with refresh.
  It needs `OAUTH_CLIENT_ID` set in Arches settings and a matching OAuth
  application (public client, "Resource owner password-based" grant).
- The session (tokens included) is stored with `app.credentials`, which uses
  the OS keychain on desktop. It is restored by refresh on next launch.
- Requests go through `app.nativeFetch` on desktop, so there's no CORS
  configuration. In the web build `nativeFetch` is present on the API object
  but `undefined`, so the plugin falls back to `window.fetch`. That works
  against the test instance with `CORS_ALLOWED_ORIGINS` set.
- **Verified against the test instance:** sign-in, refresh, node listing and
  loading, by the integration suite and through the panel UI in the browser
  suite.

### 6. Spatial views

- GeoLibre's editable PostGIS mode lists views but shows them disabled as
  read-only, because they have no primary key. Saving to a view would fail
  anyway.
- Its connection details aren't exposed to plugins: `listLayers()` returns
  only id, name, type, visibility and opacity, and the connection string is
  kept in memory only.
- **So "adopting" a direct-DB spatial view layer isn't feasible.** Spatial
  views are supported through the Arches API path only. The plan is
  corrected.

### Arches-side findings

- `/geojson` overwrites each feature's UUID with a running number, so the
  plugin can't see `featureid`.
    - Keys fall back to (tileid, position in tile). This works because the
      plugin always rewrites whole tiles from the layer's current state.
    - The cost is that features get new UUIDs every time their tile is pushed.
    - The Phase 1 `/geojson` fix should also report `featureid` as a property.
- **`/geojson` has three bugs on 8.1** (all fixed in the test instance's
  stand-in view, `test-instance/geolibre_test_support/views.py`):
    1. It reads `tile` before it is bound, so every request raises
       `UnboundLocalError`.
    2. It calls `resourceid.split` when `resourceid` is absent.
    3. `include_primary_name` passes the view, not the resource, to the
       descriptor function.
- **New 8.1 projects default to the deny-by-default permission framework.**
  Resources without explicit object permissions are invisible to everyone but
  superusers, through `/geojson` too. The plugin has to cope with that: in
  real deployments a user may see a node yet none of its resources.
- **`/api/nodes/?perms=write_nodegroup` doesn't mean the user can edit.**
  Nodegroup permissions are open unless explicitly restricted, so even the
  read-only test user is listed as able to write every node. The actual
  gate is the `Resource Editor` group (required by `/api/node_value/`) plus
  per-resource permissions.
    - `/auth/user_profile` returns group ids, not names, so the plugin can't
      tell an editor up front. For now it attempts the write and reports 403s
      per feature.
    - The v1 `/api/gis/layers` endpoint should return a real `can_edit` flag.
- **Edits by users outside `Resource Reviewer` are saved as provisional.**
  The tile keeps its approved data, `/geojson` only returns approved data,
  and Arches keeps one provisional edit per user per tile, so each push
  replaces the user's last one. To the user, the edit looks lost after the
  reload.
    - The plugin reads `is_reviewer` from `/auth/user_profile` at sign-in.
      Pushes report how many edits await review, and the panel says they
      won't show until approved.
    - Phase 2 should consider showing a user's own pending geometry. That
      needs a way to read provisional edits.
- **Resources created through `/api/node_value/` have no owner and no
  permissions.** `TileProxyModel.update_node_value` calls
  `resource_instance.save()` without the user. Under default-deny, the new
  resource is invisible to its creator and everyone else but superusers.
  Phase 1 should pass the requesting user through. The integration suite
  has an `it.fails` test that will flag when this is fixed.
- **Loading a whole node through `/geojson` is slow:** 55,032 Location
  features took 26.8 s. The v1 bbox API is needed for real inventories.
- The system-settings graph's `DEFAULT_BOUNDS` geometry node is listed in the
  catalog. Hide it in Phase 2.

## Manual test checklist (GeoLibre Desktop)

Prerequisites:

- The Arches test instance running on port 8002 (see `docs/testing.md`);
  sign in as `geolibre_editor`

1. `VITE_ARCHES_GEOLIBRE_DIAGNOSTICS=true npm run install:geolibre`, restart
   GeoLibre, then open **Plugins → Installed → Arches**.
2. The Arches panel docks to the right of Layers. Check the **Diagnostics →
   Host** list: everything except `getProjectSnapshot` should show ✓, and the
   credential store should say `keychain`.
3. Sign in. Restart GeoLibre, and the session should restore without a
   password.
4. In the catalog, **Add** a geometry node. Select a feature and check
   **Selected features** shows `tileid`, `resourceinstanceid` and
   `arches_feature_key`.
5. Edit the layer with the GeoEditor: move a vertex, delete a feature, draw a
   new one, split a polygon, copy a feature. Save the session.
    - **Pending changes** should update on its own within about a second. If
      it doesn't, record that and use **Check**.
    - Expected counts: 1 edited; 1 deleted; new = 1 drawn + 1 split-off piece
        - 1 copy.
6. Select the split pieces and the copy. Record their `id` and
   `arches_feature_key` values.
7. **Push to Arches**. Expect "Saved N tile(s); created 1 resource(s)", the old
   layer replaced by a fresh one, and the changes visible in the Arches
   resource editor (including the edit log).
8. Try a merge/union and record what the diff reports.
9. Toggle GeoLibre's theme and check the panel follows it.
10. Save a project, reopen it, and record what happens to the Arches layer.
    Expected: it reloads from the embedded data, and the plugin has forgotten
    it until project state is implemented.

Record results in this file under each spike.
