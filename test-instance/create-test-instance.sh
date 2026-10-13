#!/usr/bin/env bash
# Creates (or re-wires) a local Arches 8.2 project for testing arches-geolibre.
#
# Usage: test-instance/create-test-instance.sh <python-env> <project-parent-dir> [resource-count]
#   python-env          a virtualenv with Arches 8.2 installed: the GeoLibre
#                       preview of Arches until 8.2.0 is released
#                       (docs/arches-compatibility.md), e.g. ~/arches-geolibre-env
#   project-parent-dir  where the arches_geolibre_test project goes
#   resource-count      synthetic resources to generate (default 50000; 0 skips)
#
# Needs PostgreSQL/PostGIS and Elasticsearch running with Arches' default
# settings. Creates (and on re-runs, recreates) the project's database and
# Elasticsearch indexes (named after the project); nothing else is touched.

set -euo pipefail

PYTHON_ENV="$(cd "${1:?python env required}" && pwd)"
PROJECT_PARENT="$(cd "${2:?project parent directory required}" && pwd)"
RESOURCE_COUNT="${3:-50000}"

PROJECT_NAME="${GEOLIBRE_TEST_PROJECT_NAME:-arches_geolibre_test}"
PROJECT_ROOT="$PROJECT_PARENT/$PROJECT_NAME"
PACKAGE_DIR="$PROJECT_ROOT/$PROJECT_NAME"
SUPPORT_APP_SOURCE="$(cd "$(dirname "$0")" && pwd)/geolibre_test_support"
OAUTH_CLIENT_ID="arches-geolibre-test"
OAUTH_DEVICE_CLIENT_ID="arches-geolibre-test-device"
# GeoLibre's web preview (Playwright suite) and dev servers, and the hosted
# copy on GitHub Pages.
CORS_ORIGINS='["http://localhost:4173", "http://localhost:5173", "https://fargeo.github.io"]'

if [ ! -d "$PACKAGE_DIR" ]; then
    mkdir -p "$PROJECT_ROOT"
    # Run from a neutral directory: Django refuses a project name that is
    # importable from the current directory.
    (cd "$(mktemp -d)" && "$PYTHON_ENV/bin/arches-admin" startproject "$PROJECT_NAME" -d "$PROJECT_ROOT")
fi

ln -sfn "$SUPPORT_APP_SOURCE" "$PROJECT_ROOT/geolibre_test_support"

"$PYTHON_ENV/bin/python" - "$PACKAGE_DIR" "$OAUTH_CLIENT_ID" "$OAUTH_DEVICE_CLIENT_ID" "$CORS_ORIGINS" <<'PYTHON'
import sys
from pathlib import Path

package_dir, oauth_client_id, oauth_device_client_id, cors_origins = sys.argv[1:]
marker = "# arches-geolibre test support"

settings_path = Path(package_dir, "settings.py")
settings_text = settings_path.read_text()
if marker not in settings_text:
    settings_text = settings_text.replace(
        "INSTALLED_APPS += (\n",
        f'INSTALLED_APPS += (\n    "geolibre_test_support",  {marker}\n',
        1,
    )
    settings_path.write_text(settings_text)

settings_local_path = Path(package_dir, "settings_local.py")
settings_local_text = settings_local_path.read_text() if settings_local_path.exists() else ""
if marker not in settings_local_text:
    settings_local_text += (
        f"\n{marker}\n"
        f'OAUTH_CLIENT_ID = "{oauth_client_id}"\n'
        f'OAUTH_DEVICE_CLIENT_ID = "{oauth_device_client_id}"\n'
        f"CORS_ALLOWED_ORIGINS = {cors_origins}\n"
    )
    settings_local_path.write_text(settings_local_text)

PYTHON

cd "$PROJECT_ROOT"
"$PYTHON_ENV/bin/python" manage.py setup_db --force
"$PYTHON_ENV/bin/python" manage.py setup_geolibre_test
if [ "$RESOURCE_COUNT" -gt 0 ]; then
    "$PYTHON_ENV/bin/python" manage.py generate_geolibre_test_data --count "$RESOURCE_COUNT"
fi

echo
echo "Done. Start it with:"
echo "  cd $PROJECT_ROOT && $PYTHON_ENV/bin/python manage.py runserver 8002"
