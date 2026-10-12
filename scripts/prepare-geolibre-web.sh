#!/usr/bin/env bash
# Builds GeoLibre's web app with this plugin bundled in, for the Playwright
# suite in e2e/. The checkout lives in .geolibre/ (git-ignored).
#
#   GEOLIBRE_REF   GeoLibre tag or branch to test against (default v3.4.0)
#   GEOLIBRE_DIR   where to keep the checkout (default .geolibre)

set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GEOLIBRE_REF="${GEOLIBRE_REF:-v3.4.0}"
GEOLIBRE_DIR="${GEOLIBRE_DIR:-$REPOSITORY_ROOT/.geolibre}"
PLUGIN_ID="$(node -p "require('$REPOSITORY_ROOT/geolibre-plugin/plugin.json').id")"

if [ ! -d "$GEOLIBRE_DIR/.git" ]; then
    git clone --depth 1 --branch "$GEOLIBRE_REF" https://github.com/opengeos/GeoLibre.git "$GEOLIBRE_DIR"
else
    git -C "$GEOLIBRE_DIR" fetch --depth 1 origin "refs/tags/$GEOLIBRE_REF:refs/tags/$GEOLIBRE_REF" 2>/dev/null \
        || git -C "$GEOLIBRE_DIR" fetch --depth 1 origin "$GEOLIBRE_REF"
    git -C "$GEOLIBRE_DIR" checkout --quiet FETCH_HEAD 2>/dev/null || git -C "$GEOLIBRE_DIR" checkout --quiet "$GEOLIBRE_REF"
fi

(cd "$GEOLIBRE_DIR" && npm ci --no-audit --no-fund)

(cd "$REPOSITORY_ROOT" && npm run build)
BUNDLED_PLUGIN_DIR="$GEOLIBRE_DIR/apps/geolibre-desktop/public/plugins/$PLUGIN_ID"
rm -rf "$BUNDLED_PLUGIN_DIR"
mkdir -p "$(dirname "$BUNDLED_PLUGIN_DIR")"
cp -R "$REPOSITORY_ROOT/geolibre-plugin" "$BUNDLED_PLUGIN_DIR"

(cd "$GEOLIBRE_DIR" && npm run build)
echo "GeoLibre $GEOLIBRE_REF web build with $PLUGIN_ID is ready in $GEOLIBRE_DIR."
