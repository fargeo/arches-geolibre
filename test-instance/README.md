# Arches test instance

A throwaway Arches 8.2 project for developing and testing the plugin. It
needs an Arches 8.2 that includes three core PRs:

- [archesproject/arches#13011](https://github.com/archesproject/arches/pull/13011): `/geojson` fixes
- [archesproject/arches#13012](https://github.com/archesproject/arches/pull/13012): creators can see resources they create through the API
- [archesproject/arches#13013](https://github.com/archesproject/arches/pull/13013): tile deletion through the API

Until those merge, use a local branch with all three merged onto
`dev/8.2.x`.

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
- **An OAuth application** (client id `arches-geolibre-test`, password grant).
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
- a virtualenv with Arches 8.2 (including the three PRs above) installed

```shell
test-instance/create-test-instance.sh ~/Projects/arches4/dev_env_82 ~/Projects/arches4
```

This creates `~/Projects/arches4/arches_geolibre_test_82`, with its database
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
cd ~/Projects/arches4/arches_geolibre_test_82
~/Projects/arches4/dev_env_82/bin/python manage.py runserver 8002
```

Port 8002 keeps it clear of other projects on 8000 and 8001. The API is all
the plugin needs. To browse resources in Arches' own UI, build its frontend
once with `npm run build_development`.
