import os

from django.urls import re_path

from geolibre_test_support.views import FixedGeoJSON, TileWithDelete

UUID_PATTERN = (
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
)

# Must be included ahead of arches.urls so these shadow the core routes.
# GEOLIBRE_TEST_STOCK_ARCHES=true leaves them out, so the instance behaves
# like a released Arches 8.1 without the planned core fixes.
STOCK_ARCHES = os.environ.get("GEOLIBRE_TEST_STOCK_ARCHES") == "true"

urlpatterns = (
    []
    if STOCK_ARCHES
    else [
        re_path(r"^geojson$", FixedGeoJSON.as_view(), name="geolibre_test_geojson"),
        re_path(
            rf"^api/tiles/(?P<tileid>{UUID_PATTERN})$",
            TileWithDelete.as_view(),
            name="geolibre_test_api_tiles",
        ),
    ]
)
