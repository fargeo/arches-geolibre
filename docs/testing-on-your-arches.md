# Trying the plugin with your own Arches 8.2

This branch of the plugin targets **Arches 8.2** and assumes three core PRs
are in place:

- [archesproject/arches#13011](https://github.com/archesproject/arches/pull/13011): `/geojson` fixes
- [archesproject/arches#13012](https://github.com/archesproject/arches/pull/13012): creators can see resources they create through the API
- [archesproject/arches#13013](https://github.com/archesproject/arches/pull/13013): tile deletion through the API

Until they're released, the instance must run a build of Arches that includes
them. For released Arches 8.1, use the plugin's `main` branch instead.

## 1. Prepare the Arches instance (an admin does this once)

1. **Allow the plugin to sign in.** The plugin signs in with OAuth2's
   password grant, the same way the QGIS and ArcGIS Pro add-ins do.
    - In Django admin (`/admin/oauth2_provider/application/add/`), add an
      application:
        - **Client type:** Public
        - **Authorization grant type:** Resource owner password-based
        - Leave the redirect URIs empty, and note the **Client id**.
    - In the project's `settings.py` or `settings_local.py`, set
      `OAUTH_CLIENT_ID = "<that client id>"`, then restart Arches.
2. **Check the resource models are active.** In the graph designer, a model
   must be published and marked active. Arches refuses some operations on
   inactive models, including tile deletion.
3. **Check who can do what.**

    | To...                             | A user needs                                                                               |
    | --------------------------------- | ------------------------------------------------------------------------------------------ |
    | see geometry                      | read access to the resources (with default-deny, explicit permissions)                     |
    | edit geometry                     | the **Resource Editor** group, plus edit access to each resource                           |
    | have edits apply straight away    | also **Resource Reviewer**; otherwise edits are provisional until approved                 |
    | delete a resource's last geometry | **Resource Reviewer**; for others, that geometry is cleared instead, as a provisional edit |

    On instances using the **default-deny** permission framework (the default
    for new projects), access is recorded in the search index when each
    resource is indexed. If you add a user to a group afterwards, reindex
    (`python manage.py es index_resources_by_type -rt <graph id>`) before
    they'll see existing resources.

GeoLibre Desktop talks to Arches directly, so no CORS settings are needed.

## 2. Install the plugin in GeoLibre Desktop

1. Install [GeoLibre Desktop](https://geolibre.app) 3.4 or later.
2. Get `arches-geolibre-<version>.zip`, from whoever shared it, or build it
   with `npm run package:zip` on this branch.
3. In GeoLibre, open **Settings → Manage Plugins**, switch to its
   **Settings** tab, and under **Install from file** choose the zip.
    - Alternatively, unzip it into
      `~/Library/Application Support/org.geolibre.desktop/plugins/arches-geolibre/`
      (macOS) and restart GeoLibre.
4. Open **Plugins → Installed → Arches**. The panel docks beside Layers.

## 3. Use it

1. **Sign in** with your Arches URL (for example
   `https://arches.example.org`), username and password.
2. Under **Add Arches data**, choose **Add** next to a geometry node or a
   spatial view. The whole node loads, and the map zooms to it.
    - Large nodes take a while: about 11 seconds for 55,000 features on a
      local test instance.
3. **To edit,** open the layer's **⋯ → Edit geometry**. Zoom in before
   drawing: the editor can't draw on the zoomed-out globe. Edit with the
   GeoEditor toolbar, then **⋯ → Finish editing geometry**. Changes appear
   under **Pending changes**:
    - Untick any you don't want to send.
    - For a newly drawn feature, choose **New resource** or **Existing
      resource**. For an existing resource, find it by name or select one of
      its features on the map.
    - Then **Push to Arches**.
4. Select features on the map to get **Edit in Arches** or **View in
   Arches** links.

If you're not a Resource Reviewer, your pushed edits wait for review. Until
then, they're drawn in orange in an **Awaiting review** layer. That includes
resources you've created.

## Known limitations

- **Layers load whole nodes.** `/geojson` has no map-area filter yet, so a
  very large node can take a while to load.
- **Spatial views load their geometry only**, not their attribute columns.
- **Changes you untick stay visible on the map** until the push reloads the
  layer. GeoLibre gives plugins no way to update a layer in place.

Please report problems with what you were doing, the Arches version and
build, and a screenshot of the Arches panel. If something failed, add
GeoLibre's **Diagnostics** list (bottom right of the status bar).
