#!/usr/bin/env bash
# Assembles the GitHub Pages site (.github/workflows/publish-site.yml):
#
#   app/                 GeoLibre's web app with this plugin preinstalled
#   plugin.json, dist/   the plugin, for adding to other GeoLibre sites by URL
#   arches-geolibre.zip  the plugin, for Install from file
#   index.html           a landing page (from pages/index.html)
#
#   SITE_DIR       where to assemble it (default _site)
#   GEOLIBRE_REF   GeoLibre release to host (default v3.4.0)
#   GEOLIBRE_DIR   GeoLibre checkout (default .geolibre)

set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITE_DIR="${SITE_DIR:-$REPOSITORY_ROOT/_site}"
export GEOLIBRE_REF="${GEOLIBRE_REF:-v3.4.0}"
export GEOLIBRE_DIR="${GEOLIBRE_DIR:-$REPOSITORY_ROOT/.geolibre}"

# A relative base lets the app run from any path, such as /arches-geolibre/app/,
# as GeoLibre's own hosted copy does.
GEOLIBRE_APP_BASE=./ "$REPOSITORY_ROOT/scripts/prepare-geolibre-web.sh"
(cd "$REPOSITORY_ROOT" && npm run package:zip)

PLUGIN_VERSION="$(node -p "require('$REPOSITORY_ROOT/geolibre-plugin/plugin.json').version")"

rm -rf "$SITE_DIR"
mkdir -p "$SITE_DIR/app"
cp -R "$GEOLIBRE_DIR/apps/geolibre-desktop/dist/." "$SITE_DIR/app/"
# GeoLibre is MIT licensed; its notice travels with the copy we host.
cp "$GEOLIBRE_DIR/LICENSE" "$SITE_DIR/app/GEOLIBRE-LICENSE"

cp -R "$REPOSITORY_ROOT/geolibre-plugin/plugin.json" "$REPOSITORY_ROOT/geolibre-plugin/dist" "$SITE_DIR/"
cp "$REPOSITORY_ROOT/arches-geolibre-$PLUGIN_VERSION.zip" "$SITE_DIR/"
cp "$REPOSITORY_ROOT/arches-geolibre-$PLUGIN_VERSION.zip" "$SITE_DIR/arches-geolibre.zip"

sed -e "s/{{PLUGIN_VERSION}}/$PLUGIN_VERSION/g" -e "s/{{GEOLIBRE_VERSION}}/${GEOLIBRE_REF#v}/g" \
    "$REPOSITORY_ROOT/pages/index.html" >"$SITE_DIR/index.html"

echo "Site for arches-geolibre $PLUGIN_VERSION with GeoLibre $GEOLIBRE_REF is in $SITE_DIR."
