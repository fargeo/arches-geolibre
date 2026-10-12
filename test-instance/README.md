# Arches test instance

A throwaway Arches 8.1 project for developing and testing the plugin. It
contains:

- **GeoLibre Test Asset**, a resource model with a `Name` node and two
  geometry nodes, `Location` and `Extent`.
- **50,000 synthetic resources** around Greater London.
    - Every resource has a `Location` (a point, line or polygon). About 10% of
      those tiles hold two features.
    - About 20% of resources also have an `Extent` polygon.
- **An OAuth application** (client id `arches-geolibre-test`, password grant).
- **Two users**, both with password `geolibre-test-password`:

    | User                   | Groups                             | Can                                                    |
    | ---------------------- | ---------------------------------- | ------------------------------------------------------ |
    | `geolibre_editor`      | Resource Editor, Resource Reviewer | edit; changes apply immediately                        |
    | `geolibre_contributor` | Resource Editor                    | edit; changes are saved as provisional, pending review |
    | `geolibre_viewer`      | Guest                              | read only                                              |

- **A fixed `/geojson` endpoint** (`geolibre_test_support/views.py`). It is a
  copy of core's view with the three bugs that break it on 8.1 fixed, and it
  also reports `featureid`. This is the planned Phase 1 core fix; remove it
  once core ships the fix.

New Arches projects use the **default-deny** permission framework, so the
generator grants each test resource explicit object permissions for the
`Resource Editor` and `Guest` groups.

## Create it

Prerequisites:

- PostgreSQL/PostGIS and Elasticsearch running with Arches' default
  connection settings (`postgres`/`postgis` on `localhost:5432`, Elasticsearch
  on `localhost:9200`)
- a virtualenv with Arches 8.1

```shell
test-instance/create-test-instance.sh ~/Projects/arches4/dev_env ~/Projects/arches4
```

This creates `~/Projects/arches4/arches_geolibre_test`, with the database and
Elasticsearch indexes named `arches_geolibre_test`. It links this folder's
`geolibre_test_support` app into the project, so changes here take effect
without re-running the script.

Re-running the script rebuilds the database from scratch. Stop the server
first, because `setup_db` drops the database. Pass a third argument to change
the number of generated resources (`0` skips generation). 50,000 takes about
8 minutes on a recent Mac.

## Run it

```shell
cd ~/Projects/arches4/arches_geolibre_test
~/Projects/arches4/dev_env/bin/python manage.py runserver 8001
```

Port 8001 keeps it clear of other projects on 8000. The API is all the plugin
needs. To browse resources in Arches' own UI, build its frontend once with
`npm run build_development`.
