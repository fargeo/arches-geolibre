# Trying the plugin with your own Arches 8.1

The plugin works with a **released Arches 8.1** (tested against 8.1.5
behaviour) with no code changes on the Arches side. You need a little
configuration on the instance, GeoLibre Desktop, and the plugin zip.

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
2. **Check the resource models are active.** Arches search, which the
   plugin reads through, skips inactive models. In the graph designer, a
   model must be published and marked active.
3. **Check who can do what.**

    | To...                          | A user needs                                                               |
    | ------------------------------ | -------------------------------------------------------------------------- |
    | see geometry                   | read access to the resources (with default-deny, explicit permissions)     |
    | edit geometry                  | the **Resource Editor** group, plus edit access to each resource           |
    | have edits apply straight away | also **Resource Reviewer**; otherwise edits are provisional until approved |

    On instances using the **default-deny** permission framework (the default
    for new 8.1 projects), access is recorded in the search index when each
    resource is indexed. If you add a user to a group afterwards, reindex
    (`python manage.py es index_resources_by_type -rt <graph id>`) before
    they'll see existing resources.

GeoLibre Desktop talks to Arches directly, so no CORS settings are needed.

## 2. Install the plugin in GeoLibre Desktop

1. Install [GeoLibre Desktop](https://geolibre.app) 3.4 or later.
2. Get `arches-geolibre-<version>.zip`, from whoever shared it, or build it
   with `npm run package:zip` in this repo.
3. In GeoLibre, open **Settings → Manage Plugins**, switch to its
   **Settings** tab, and under **Install from file** choose the zip.
    - Alternatively, unzip it into
      `~/Library/Application Support/org.geolibre.desktop/plugins/arches-geolibre/`
      (macOS) and restart GeoLibre.
4. Open **Plugins → Installed → Arches**. The panel docks beside Layers.

## 3. Use it

1. **Sign in** with your Arches URL (for example
   `https://arches.example.org`), username and password.
2. **Zoom to an area first.** Layers load the resources **in the current
   map view**, up to 500 at a time. If there are more, the panel asks you to
   zoom in. Use **Load this view** on a layer to reload it for wherever
   you've moved to.
3. Under **Add Arches data**, choose **Add** next to a geometry node or a
   spatial view.
4. **To edit,** open the layer's **⋯ → Edit geometry**. Edit with the
   GeoEditor toolbar, then **⋯ → Finish editing geometry**. Changes appear
   under **Pending changes**:
    - Untick any you don't want to send.
    - For a newly drawn feature, choose **New resource** or **Existing
      resource**. For an existing resource, find it by name or select one of
      its features on the map.
    - Then **Push to Arches**.
5. Select features on the map to get **Edit in Arches** or **View in
   Arches** links.

If you're not a Resource Reviewer, your pushed edits wait for review. Until
then, they're drawn in orange in an **Awaiting review** layer.

## Known limitations on released Arches 8.1

These are fixed by changes proposed for Arches core (see the project plan):

- **New resources you create from GeoLibre won't be visible** afterwards, to
  you or anyone else except superusers, on default-deny instances. Editing
  existing resources is unaffected.
- **Deleting all of a resource's geometry in a node clears it** rather than
  deleting the tile. GeoLibre's diagnostics panel will show one failed
  request when this happens.
- **Loading counts every resource with any geometry in view.** Arches'
  search can't limit the area check to one node, so a node that few
  resources use can still hit the 500 limit. Zoom in further if that happens.
- **Loading is paged at 5 resources per request** (Arches'
  `SEARCH_ITEMS_PER_PAGE`), four requests at a time. Against a local test
  instance about 300 resources load in 2 seconds; over a network, expect
  longer. An admin can raise that setting to speed it up.
- **Spatial views load their geometry only**, not their attribute columns.

Please report problems with what you were doing, the Arches version, and a
screenshot of the Arches panel. If something failed, add GeoLibre's
**Diagnostics** list (bottom right of the status bar).
