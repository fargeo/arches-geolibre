# Trying the plugin with your own Arches 8.2

This branch of the plugin targets **Arches 8.2** and assumes three core PRs
are in place:

- [archesproject/arches#13011](https://github.com/archesproject/arches/pull/13011): `/geojson` fixes
- [archesproject/arches#13012](https://github.com/archesproject/arches/pull/13012): creators can see resources they create through the API
- [archesproject/arches#13013](https://github.com/archesproject/arches/pull/13013): tile deletion through the API

Until they're released, the instance must run a build of Arches that includes
them. For released Arches 8.1, use the plugin's `main` branch instead.

Browser sign-in also needs [archesproject/arches#13014](https://github.com/archesproject/arches/pull/13014) (device sign-in). Without it, the plugin
signs in with a password.

## 1. Prepare the Arches instance (an admin does this once)

1. **Allow the plugin to sign in.** Set up either or both:
    - **Browser sign-in** (recommended): users approve the plugin on Arches'
      own sign-in page, so the plugin never sees their password. In Django
      admin (`/admin/oauth2_provider/application/add/`), add an application:
        - **Client type:** Public
        - **Authorization grant type:** Device Code
        - Leave the redirect URIs empty, and note the **Client id**.

        Then set `OAUTH_DEVICE_CLIENT_ID = "<that client id>"` in the
        project's `settings.py` or `settings_local.py`.

    - **Password sign-in**, the way the QGIS and ArcGIS Pro add-ins sign in:
      add another application the same way, with the grant type **Resource
      owner password-based**, and set `OAUTH_CLIENT_ID` to its client id.
      django-oauth-toolkit allows one grant type per application, so this
      must be a separate application.

    Restart Arches after changing settings.

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

4. **For GeoLibre on the web only: allow its address.** GeoLibre Desktop
   talks to Arches directly, but the web version runs in a browser, which
   only lets it call Arches if Arches allows the GeoLibre site. Add the sites
   to the project's settings and restart Arches:

    ```python
    CORS_ALLOWED_ORIGINS = ["https://web.geolibre.app", "https://geolibre.app"]
    ```

    Add the address of any self-hosted GeoLibre too. Arches must be served
    over HTTPS: browsers block an HTTPS page from calling a plain-HTTP
    address.

## 2. Install the plugin

### GeoLibre Desktop

1. Install [GeoLibre Desktop](https://geolibre.app) 3.4 or later.
2. Get `arches-geolibre-<version>.zip`, from whoever shared it, or build it
   with `npm run package:zip` on this branch.
3. In GeoLibre, open **Settings → Manage Plugins**, switch to its
   **Settings** tab, and under **Install from file** choose the zip.
    - Alternatively, unzip it into
      `~/Library/Application Support/org.geolibre.desktop/plugins/arches-geolibre/`
      (macOS) and restart GeoLibre.
4. Open **Plugins → Installed → Arches**. The panel docks beside Layers.

### GeoLibre on the web

1. Open [web.geolibre.app](https://web.geolibre.app), then **Settings →
   Manage Plugins**, and switch to its **Settings** tab.
2. Under **Manifest URLs**, add
   `https://fargeo.github.io/arches-geolibre/plugin.json`. GeoLibre loads the
   published release and keeps it until you approve an update.
    - Or, under **Install from file**, choose
      `arches-geolibre-<version>.zip`. It's also published at
      `https://fargeo.github.io/arches-geolibre/arches-geolibre.zip`.
3. Open **Plugins → Installed → Arches**.

On the web, the plugin signs you out when you reload the page, unless you
tick **Stay signed in on this browser** when signing in. GeoLibre on the web
stores sign-ins in the browser's local storage, where other plugins could
read them, so it's off by default. On a shared computer, leave it off.

## 3. Use it

1. **Sign in.** Enter your Arches URL (for example
   `https://arches.example.org`) and choose **Sign in with browser**. Arches
   opens in your browser. Sign in there if asked, check that it shows the
   code from the panel, and approve. To use a username and password instead,
   choose **Use a password instead**.
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
5. **To give resources geometry, including resources with none yet,** use
   **Edit resources**:
    - Choose a model and geometry node, then **Start a worklist**.
    - Find resources under **Missing geometry** (every resource with no
      geometry in that node), **Search** (by name), or **From the map** (the
      resources of features you've selected).
    - Work through the worklist one resource at a time:
        - **Draw** it on the _(worklist)_ layer with **⋯ → Edit geometry**,
          and save the edit session. Whatever you draw goes to the current
          resource.
        - Or select features in any other layer, such as a survey shapefile or
          GPS track, and choose **Use the selected feature**.
        - Or, for a resource that already has geometry, **Zoom to** it and
          edit it.
    - Choose **Next**, then push from **Pending changes**.

If you're not a Resource Reviewer, your pushed edits wait for review. Until
then, they're drawn in orange in an **Awaiting review** layer. That includes
resources you've created.

## Known limitations

- **Layers load whole nodes.** `/geojson` has no map-area filter yet, so a
  very large node can take a while to load.
- **Spatial views load their geometry only**, not their attribute columns.
- **Browser sign-in adds errors to GeoLibre Desktop's Diagnostics.** While it waits
  for you to approve, the plugin checks with Arches every few seconds, and
  Arches answers "not yet" with an HTTP 400. GeoLibre lists each of those as
  an error. They're expected and can be ignored.
- **Changes you untick stay visible on the map** until the push reloads the
  layer. GeoLibre gives plugins no way to update a layer in place.

Please report problems with what you were doing, the Arches version and
build, and a screenshot of the Arches panel. If something failed, add
GeoLibre's **Diagnostics** list (bottom right of the status bar).
