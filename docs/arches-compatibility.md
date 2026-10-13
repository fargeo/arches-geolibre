# Which Arches to use

The plugin works with **Arches 8.2**. Arches 8.1 isn't supported. The last
build that worked with it is tagged `arches-8.1-final`, and won't be updated.

Some of the Arches changes the plugin needs are still in review. Until
they're released in Arches 8.2.0, use the **GeoLibre preview of Arches**: the
Arches 8.2 development branch plus those changes, published as
[`rmg/geolibre_8.2_preview`](https://github.com/archesproject/arches/tree/rmg/geolibre_8.2_preview)
in archesproject/arches.

The preview is pre-release Arches. Use it on a test instance or a copy of
your data, not in production.

## The changes the plugin needs

| Change                                                                  | What it does                                                                 | Needed?              | Without it                                                                                        |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------- |
| [#13011](https://github.com/archesproject/arches/pull/13011) `/geojson` | Fixes the API the plugin reads geometry through, and identifies each feature | **Required**         | Nothing loads. The plugin says "Arches couldn't return geometry" and links here.                  |
| [#13012](https://github.com/archesproject/arches/pull/13012) ownership  | Lets users see resources they create through the API                         | **Strongly advised** | On instances using default-deny permissions, users can't see resources they create in the plugin. |
| [#13013](https://github.com/archesproject/arches/pull/13013) tiles      | Lets Resource Reviewers delete tiles through the API                         | Optional             | Removing a resource's last geometry clears it instead, leaving an empty tile.                     |
| [#13014](https://github.com/archesproject/arches/pull/13014) sign-in    | Browser sign-in: users approve the plugin on Arches' own sign-in page        | Optional             | **Sign in with browser** isn't offered; the plugin signs in with a username and password.         |
| [#13015](https://github.com/archesproject/arches/pull/13015) node value | Adding a value fills a resource's empty tile instead of adding another       | Optional             | The plugin works around it, with one extra request when a resource gets its first geometry.       |

Each pull request shows whether it has merged yet. As they merge, the preview
picks them up from the development branch, and this page will say which
Arches release includes them.

## Installing the preview

In the Python environment of your Arches 8.2 project:

```shell
pip install --upgrade "arches @ git+https://github.com/archesproject/arches.git@rmg/geolibre_8.2_preview"
```

Then follow your project's usual steps after an Arches upgrade:

```shell
python manage.py migrate
npm run build_development   # or build_production
```

Restart Arches. The admin setup the plugin needs, such as OAuth applications
and CORS for GeoLibre on the web, is in
[testing-on-your-arches.md](testing-on-your-arches.md).

### For the plugin's test instance

Install the preview into a fresh virtual environment, then build the test
instance with it ([test-instance/README.md](../test-instance/README.md)):

```shell
python3.12 -m venv ~/arches-geolibre-env
~/arches-geolibre-env/bin/pip install "arches @ git+https://github.com/archesproject/arches.git@rmg/geolibre_8.2_preview"
test-instance/create-test-instance.sh ~/arches-geolibre-env ~/projects
```

### Staying up to date

The preview is rebuilt whenever one of the pull requests changes. To pick up
the latest, run the same `pip install --upgrade` command again, then `migrate`
and rebuild the frontend.

## Once Arches 8.2.0 is released

Upgrade to the release (`pip install "arches>=8.2,<8.3"`), the same way as any
Arches upgrade. Any of the changes above that didn't make it into the release
will be listed here, with what to do instead. The preview branch will then be
deleted.

## Maintainers: rebuilding the preview

The preview is built by a script, from the Arches development branch
(`dev/8.2.x`) plus each pull request that hasn't merged yet:

```shell
scripts/build-arches-preview.sh ~/path/to/your/arches/clone
git -C ~/path/to/your/arches/clone push --force origin rmg/geolibre_8.2_preview
```

- It works in a temporary worktree, so your Arches checkout is left as it is.
- It takes each pull request's latest commits, and skips any already merged.
- Pull requests often add lines in the same places. Conflicts in the release
  notes and in tests are resolved by keeping both sides; a conflict in
  application code stops the build, so it can be resolved in the pull request
  itself.

Rebuild after any of the pull requests changes, and when `dev/8.2.x` moves on.
When the plugin needs another Arches change, add its number to
`PULL_REQUESTS` in the script and a row to the table above.
