# arches-geolibre

A [GeoLibre](https://geolibre.app) plugin for loading, editing and creating
[Arches](https://www.archesproject.org) resource geometries.

> Status: Phase 0 (spikes). The panel includes a diagnostics section that
> won't ship. See [docs/phase-0-spikes.md](docs/phase-0-spikes.md).

## Development

```shell
npm install
npm run install:geolibre   # build, then copy into GeoLibre Desktop's plugins folder
```

Restart GeoLibre Desktop after each install. Then enable **Arches** under
Manage Plugins.

| Command                    | Purpose                                            |
| -------------------------- | -------------------------------------------------- |
| `npm run build`            | Build `geolibre-plugin/dist/`                      |
| `npm run watch`            | Rebuild on save                                    |
| `npm test`                 | Unit tests                                         |
| `npm run test:integration` | Integration tests against the Arches test instance |
| `npm run test:e2e`         | Browser tests in GeoLibre's web build              |
| `npm run ts:check`         | Type-check (vue-tsc)                               |
| `npm run prettier:check`   | Formatting                                         |

`GEOLIBRE_PLUGINS_DIR` overrides the install target.

See [docs/testing.md](docs/testing.md) for setting up the Arches test
instance, running each suite, and testing in GeoLibre Desktop.

To try the plugin on an existing Arches 8.2 instance, see
[docs/testing-on-your-arches.md](docs/testing-on-your-arches.md).
`npm run package:zip` builds the zip to install in GeoLibre. Pushing a `v*`
tag that matches `plugin.json`'s version publishes the plugin to GitHub Pages
(`.github/workflows/publish-plugin.yml`), for GeoLibre on the web to install
from `https://fargeo.github.io/arches-geolibre/plugin.json`.

## What it does

- Load Arches geometry nodes and spatial views as GeoLibre layers, styled as
  in Arches.
- Edit geometry with GeoLibre's editor and push it back, as provisional edits
  for users who aren't reviewers, with checks that nobody else changed it
  first.
- **Resource-first editing:** pick resources, including those with no
  geometry yet, which no spatial view can show, and draw their geometry, copy
  it from another layer, or edit what they have.

## Arches requirements

- Arches 8.2 with [#13011](https://github.com/archesproject/arches/pull/13011),
  [#13012](https://github.com/archesproject/arches/pull/13012) and
  [#13013](https://github.com/archesproject/arches/pull/13013). For released
  Arches 8.1, use the `main` branch.
- For browser sign-in: [archesproject/arches#13014](https://github.com/archesproject/arches/pull/13014) (device sign-in), with
  `OAUTH_DEVICE_CLIENT_ID` set and a matching public OAuth application
  allowing the device code grant
- For password sign-in: `OAUTH_CLIENT_ID` set, and a matching public OAuth
  application allowing the resource-owner password grant
- Users who edit must be in the `Resource Editor` group
- For GeoLibre on the web: Arches served over HTTPS, with the GeoLibre site
  in `CORS_ALLOWED_ORIGINS`

## Layout

```text
geolibre-plugin/plugin.json    GeoLibre manifest; dist/ is the build output
src/arches_geolibre/
  plugin.ts                    GeoLibrePlugin entry: panel and project state
  workspace.ts                 State shared by the panel and the plugin object
  create-panel-app.ts          Vue + OpenVue + vue3-gettext bootstrap
  i18n.ts, theme.ts            Translations (follow GeoLibre's language) and theme
  ArchesPanel.vue              Panel root
  components/                  Panel sections, one folder per section with sub-components
  composables/                 GeoLibre host access, workspace, edit-session detection
  geolibre/host-api.ts         Vendored subset of GeoLibre's plugin types
  locale/                      Generated translation catalogs (npm run gettext:extract / gettext:compile)
  utils/                       Arches client, catalog, layers, styles, diffing, tile rebuilds
tests/integration/             Vitest suite run against a live Arches
e2e/                           Playwright suite run in GeoLibre's web build
test-instance/                 Script and Django app for a local Arches test instance
```

## Translations

UI strings use `$gettext` (vue3-gettext), as in Arches. After changing or
adding strings, regenerate the catalogs:

```shell
npm run gettext:extract
npm run gettext:compile
```

English is the source language, so `gettext:extract` regenerates its
catalog rather than merging it: merging fuzzy-matches new strings to old
ones. The plugin follows GeoLibre's language when a catalog exists for it,
and falls back to English otherwise.

## License

AGPL-3.0-or-later, matching Arches. See [LICENSE](LICENSE).
