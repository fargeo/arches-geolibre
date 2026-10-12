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

- **A spatial view**, `geolibre_test_locations`, over Location with the
  `Name` attribute.
- **Stand-ins for two planned Arches core fixes** (`geolibre_test_support/views.py`),
  so the plugin can be tested against unpatched 8.1. Remove each once core
  ships it (the Phase 1 branch has both):
    - a fixed `/geojson`: core's view with its three 8.1 bugs fixed, faster
      resource names, and `featureid` reported;
    - `DELETE /api/tiles/<id>`: tile deletion for token clients, following
      core's rules (reviewers, or tiles that are still provisional).

The test model is **published and marked active**. Arches leaves out inactive
models from search, refuses tile deletion on them, and won't open them in the
resource editor.

New Arches projects use the **default-deny** permission framework, so the
generator grants each test resource explicit object permissions for the
`Resource Editor` and `Guest` groups.

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

To behave like a released Arches 8.1, without the stand-ins, start it with
`GEOLIBRE_TEST_STOCK_ARCHES=true` in the environment.
