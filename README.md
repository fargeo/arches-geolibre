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

## Arches requirements

- Arches 8.1+
- `OAUTH_CLIENT_ID` set, and a matching OAuth application allowing the
  resource-owner password grant
- Users who edit must be in the `Resource Editor` group

## Layout

```text
geolibre-plugin/plugin.json    GeoLibre manifest; dist/ is the build output
src/arches_geolibre/
  plugin.ts                    GeoLibrePlugin entry: registers the panel
  create-panel-app.ts          Vue + OpenVue bootstrap
  ArchesPanel.vue              Panel root
  components/                  Panel sections
  composables/                 GeoLibre host access, edit-session detection
  geolibre/host-api.ts         Vendored subset of GeoLibre's plugin types
  utils/                       Arches client, feature keys, diffing, tile rebuilds
tests/integration/             Vitest suite run against a live Arches
e2e/                           Playwright suite run in GeoLibre's web build
test-instance/                 Script and Django app for a local Arches test instance
```

## License

AGPL-3.0-or-later, matching Arches. See [LICENSE](LICENSE).
