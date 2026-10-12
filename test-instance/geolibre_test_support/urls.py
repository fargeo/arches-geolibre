from django.urls import re_path

from geolibre_test_support.views import FixedGeoJSON

# Must be included ahead of arches.urls so it shadows the core /geojson route.
urlpatterns = [
    re_path(r"^geojson$", FixedGeoJSON.as_view(), name="geolibre_test_geojson"),
]
