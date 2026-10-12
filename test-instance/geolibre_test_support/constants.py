from pathlib import Path

GRAPH_FILE = Path(__file__).parent / "graphs" / "geolibre_test_asset.json"
GRAPH_ID = "45f4ab91-54cf-5e17-ba25-c12873c73385"
NAME_NODE_ID = "91128af1-1266-5b18-87a5-92914e952769"
LOCATION_NODE_ID = "c776e991-01ed-5781-b01e-5ee7950c23ff"
EXTENT_NODE_ID = "893fe3f2-56ef-5dc6-90ec-5487aa9423c8"
SPATIAL_VIEW_SLUG = "geolibre_test_locations"

EDITOR_USERNAME = "geolibre_editor"
CONTRIBUTOR_USERNAME = "geolibre_contributor"
VIEWER_USERNAME = "geolibre_viewer"
TEST_PASSWORD = "geolibre-test-password"

# New Arches projects use the default-deny permission framework, so generated
# resources need explicit object permissions to be visible at all.
RESOURCE_PERMISSIONS_BY_GROUP = {
    "Resource Editor": (
        "view_resourceinstance",
        "change_resourceinstance",
        "delete_resourceinstance",
    ),
    "Guest": ("view_resourceinstance",),
}
