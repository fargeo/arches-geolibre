# Arches test instance

A throwaway Arches 8.2 project for developing and testing the plugin. Until
Arches 8.2.0 is released, it runs the GeoLibre preview of Arches, which adds
the fixes the plugin needs ([docs/arches-compatibility.md](../docs/arches-compatibility.md)).

The instance contains:

- **GeoLibre Test Asset**, a resource model with a `Name` node and two
  geometry nodes, `Location` and `Extent`. It's published and marked active:
  Arches leaves inactive models out of search, refuses tile deletion on
  them, and won't open them in the resource editor.
- **A spatial view**, `geolibre_test_locations`, over Location with the
  `Name` attribute.
- **50,000 synthetic resources** around Greater London.
    - Every resource has a `Location` (a point, line or polygon). About 10% of
      those tiles hold two features.
    - About 20% of resources also have an `Extent` polygon.
- **300 unlocated resources**, named "Tannery 90001" to "Brewery 90300", with
  a name but **no geometry**. They're the records that tools built on spatial
  views can't see, for resource-first editing.
    - Even-numbered ones have an empty `Location` tile, as left when geometry
      is cleared; odd-numbered ones have no `Location` tile at all.
    - They come from their own random stream, so adding them never changes the
      located resources. To add them to an existing instance, run
      `python manage.py generate_geolibre_test_data --count 0`.
    - Some are reserved, and are put back after use: 90001 and 90002 for the
      demo recording, 90291 and 90292 for the browser suite, and 90297 and
      90298 for the integration suite.
- **Two OAuth applications**: `arches-geolibre-test-device` for browser
  (device code) sign-in, and `arches-geolibre-test` for password sign-in.
- **Three users**, all with password `geolibre-test-password`:

    | User                   | Groups                             | Can                                                    |
    | ---------------------- | ---------------------------------- | ------------------------------------------------------ |
    | `geolibre_editor`      | Resource Editor, Resource Reviewer | edit; changes apply immediately                        |
    | `geolibre_contributor` | Resource Editor                    | edit; changes are saved as provisional, pending review |
    | `geolibre_viewer`      | Guest                              | read only                                              |

New Arches projects use the **default-deny** permission framework, so the
generator grants each test resource explicit object permissions for the
`Resource Editor` and `Guest` groups. Arches' built-in `anonymous` user is
in `Guest`, so the synthetic data is readable without signing in.

**Reindex after adding users.** Under default-deny, Arches writes read access
into the search index as user ids, expanded from groups when each resource is
indexed. A user added afterwards, even to a group that has access, sees
nothing until the resources are reindexed:

```shell
python manage.py es index_resources_by_type -rt 45f4ab91-54cf-5e17-ba25-c12873c73385
```

That takes about 7 minutes for 50,000 resources. A fresh build doesn't need
it, because setup creates the test users before generating data.

## Create it

Prerequisites:

- PostgreSQL/PostGIS and Elasticsearch running with Arches' default
  connection settings (`postgres`/`postgis` on `localhost:5432`, Elasticsearch
  on `localhost:9200`)
- a virtualenv with the GeoLibre preview of Arches installed:

    ```shell
    python3.12 -m venv ~/arches-geolibre-env
    ~/arches-geolibre-env/bin/pip install "arches @ git+https://github.com/archesproject/arches.git@rmg/geolibre_8.2_preview"
    ```

```shell
test-instance/create-test-instance.sh ~/arches-geolibre-env ~/projects
```

This creates `~/projects/arches_geolibre_test`, with its database
and Elasticsearch indexes named after the project. It links this folder's
`geolibre_test_support` app into the project, so changes here take effect
without re-running the script. Set `GEOLIBRE_TEST_PROJECT_NAME` to use a
different project name.

Re-running the script rebuilds the database from scratch. Stop the server
first, because `setup_db` drops the database. Pass a third argument to change
the number of generated resources (`0` skips generation). 50,000 takes
several minutes.

## Run it

```shell
cd ~/projects/arches_geolibre_test
~/arches-geolibre-env/bin/python manage.py runserver 8002
```

Its CORS settings allow GeoLibre's local web builds and the hosted copy at
`https://fargeo.github.io/arches-geolibre/app/`, so the hosted app can sign in
to `http://localhost:8002`. Browsers allow an HTTPS page to reach `localhost`,
though some ask first for permission to access your local network.

Port 8002 lets it run beside another Arches project on the default port 8000,
and is where the test suites look for it (`ARCHES_TEST_URL` changes that). The API is all
the plugin needs. To browse resources in Arches' own UI, build its frontend
once with `npm run build_development`.
