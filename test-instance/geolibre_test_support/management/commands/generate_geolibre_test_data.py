import random
import uuid

from django.conf import settings
from django.contrib.auth.models import Group, Permission
from django.contrib.contenttypes.models import ContentType
from django.core.management.base import BaseCommand
from django.db import connection
from guardian.models import GroupObjectPermission

from arches.app.models.graph import Graph
from arches.app.models.models import ResourceInstance
from arches.app.models.resource import Resource
from arches.app.models.tile import Tile

from geolibre_test_support.constants import (
    EXTENT_NODE_ID,
    GRAPH_ID,
    LOCATION_NODE_ID,
    NAME_NODE_ID,
    RESOURCE_PERMISSIONS_BY_GROUP,
)

# Greater London. Any small area works; this one has a useful basemap.
DEFAULT_BOUNDS = (-0.51, 51.29, 0.33, 51.69)
SITE_KINDS = ("Mill", "Chapel", "Barrow", "Bridge", "Warehouse", "Kiln", "Wharf")
# Records with no geometry at all, as when sites are entered from documents
# before anyone maps them. Numbered from 90001 and drawn from their own random
# stream, so adding them never changes the located resources.
UNLOCATED_KINDS = ("Tannery", "Brewery", "Foundry", "Pottery")
UNLOCATED_FIRST_NUMBER = 90_001


class Command(BaseCommand):
    help = (
        "Creates synthetic GeoLibre Test Asset resources: every resource gets a "
        "Location (a point, line or polygon, sometimes two features in one tile) "
        "and about one in five also gets an Extent polygon. Unlocated resources "
        "have a name but no geometry; half of them have an empty Location tile."
    )

    def add_arguments(self, parser):
        parser.add_argument("--count", type=int, default=50_000)
        parser.add_argument("--batch-size", type=int, default=2_000)
        parser.add_argument("--seed", type=int, default=42)
        parser.add_argument("--unlocated", type=int, default=300)

    def handle(self, *args, **options):
        random_generator = random.Random(options["seed"])
        graph = Graph.objects.get(pk=GRAPH_ID)
        initial_lifecycle_state = ResourceInstance(
            graph=graph
        ).get_initial_resource_instance_lifecycle_state()
        transaction_id = uuid.uuid4()
        permission_grants = resolve_permission_grants()

        self.create_resources(
            options["count"],
            options["batch_size"],
            lambda sequence_number: self.build_resource(
                random_generator, graph, initial_lifecycle_state, sequence_number
            ),
            permission_grants,
            transaction_id,
        )
        unlocated_random_generator = random.Random(options["seed"] + 1)
        self.create_resources(
            options["unlocated"],
            options["batch_size"],
            lambda sequence_number: self.build_unlocated_resource(
                unlocated_random_generator,
                graph,
                initial_lifecycle_state,
                UNLOCATED_FIRST_NUMBER + sequence_number - 1,
            ),
            permission_grants,
            transaction_id,
        )

        # bulk_save skips the geometry table that vector tiles and spatial views read.
        with connection.cursor() as cursor:
            cursor.execute("select refresh_geojson_geometries()")
        self.stdout.write(
            self.style.SUCCESS(f"Done. Edit log transaction id: {transaction_id}")
        )

    def create_resources(
        self, count, batch_size, build, permission_grants, transaction_id
    ):
        created_count = 0
        while created_count < count:
            current_batch_size = min(batch_size, count - created_count)
            resources = [
                build(created_count + offset + 1)
                for offset in range(current_batch_size)
            ]
            # New Arches projects deny access to resources without explicit
            # object permissions, and bulk_save indexes those permissions, so
            # they must exist before it runs.
            grant_resource_permissions(resources, permission_grants)
            Resource.bulk_save(resources, transaction_id=transaction_id)
            created_count += current_batch_size
            self.stdout.write(f"Created {created_count} of {count}.")

    def build_resource(
        self, random_generator, graph, initial_lifecycle_state, sequence_number
    ):
        name = f"{random_generator.choice(SITE_KINDS)} {sequence_number:05d}"
        resource = new_resource(graph, initial_lifecycle_state, name)
        resource_id = resource.resourceinstanceid

        location_features = [random_feature(random_generator)]
        if random_generator.random() < 0.1:
            location_features.append(random_feature(random_generator))
        resource.tiles = [
            name_tile(resource_id, name),
            build_tile(
                resource_id,
                LOCATION_NODE_ID,
                {LOCATION_NODE_ID: feature_collection(location_features)},
            ),
        ]
        if random_generator.random() < 0.2:
            resource.tiles.append(
                build_tile(
                    resource_id,
                    EXTENT_NODE_ID,
                    {
                        EXTENT_NODE_ID: feature_collection(
                            [random_feature(random_generator, geometry_type="Polygon")]
                        )
                    },
                )
            )
        return resource

    def build_unlocated_resource(
        self, random_generator, graph, initial_lifecycle_state, number
    ):
        name = f"{random_generator.choice(UNLOCATED_KINDS)} {number:05d}"
        resource = new_resource(graph, initial_lifecycle_state, name)
        resource_id = resource.resourceinstanceid
        resource.tiles = [name_tile(resource_id, name)]
        # An empty Location tile, as left when geometry is cleared, so adding
        # geometry has to fill the existing tile rather than add another.
        if number % 2 == 0:
            resource.tiles.append(
                build_tile(resource_id, LOCATION_NODE_ID, {LOCATION_NODE_ID: None})
            )
        return resource


def new_resource(graph, initial_lifecycle_state, name):
    return Resource(
        resourceinstanceid=str(uuid.uuid4()),
        graph=graph,
        graph_publication=graph.publication,
        resource_instance_lifecycle_state=initial_lifecycle_state,
        name={settings.LANGUAGE_CODE: name},
        descriptors={
            settings.LANGUAGE_CODE: {
                "name": name,
                "description": "",
                "map_popup": name,
            }
        },
    )


def name_tile(resource_id, name):
    return build_tile(
        resource_id,
        NAME_NODE_ID,
        {NAME_NODE_ID: {settings.LANGUAGE_CODE: {"value": name, "direction": "ltr"}}},
    )


def resolve_permission_grants():
    resource_content_type = ContentType.objects.get_for_model(ResourceInstance)
    return [
        (
            Group.objects.get(name=group_name),
            Permission.objects.get(
                content_type=resource_content_type, codename=codename
            ),
            resource_content_type,
        )
        for group_name, codenames in RESOURCE_PERMISSIONS_BY_GROUP.items()
        for codename in codenames
    ]


def grant_resource_permissions(resources, permission_grants):
    GroupObjectPermission.objects.bulk_create(
        [
            GroupObjectPermission(
                group=group,
                permission=permission,
                content_type=content_type,
                object_pk=str(resource.resourceinstanceid),
            )
            for resource in resources
            for group, permission, content_type in permission_grants
        ]
    )


def build_tile(resource_id, nodegroup_id, data):
    return Tile(
        {
            "tileid": str(uuid.uuid4()),
            "resourceinstance_id": resource_id,
            "nodegroup_id": nodegroup_id,
            "data": data,
            "sortorder": 0,
        }
    )


def feature_collection(features):
    return {"type": "FeatureCollection", "features": features}


def random_feature(random_generator, geometry_type=None):
    geometry_type = (
        geometry_type
        or random_generator.choices(
            ("Point", "LineString", "Polygon"), weights=(6, 1, 3)
        )[0]
    )
    west, south, east, north = DEFAULT_BOUNDS
    longitude = random_generator.uniform(west, east)
    latitude = random_generator.uniform(south, north)
    size = random_generator.uniform(0.0003, 0.003)

    if geometry_type == "Point":
        coordinates = [round(longitude, 6), round(latitude, 6)]
    elif geometry_type == "LineString":
        coordinates = [
            [round(longitude + step * size, 6), round(latitude + (step % 2) * size, 6)]
            for step in range(4)
        ]
    else:
        ring = [
            [longitude, latitude],
            [longitude + size, latitude],
            [longitude + size, latitude + size],
            [longitude, latitude + size],
            [longitude, latitude],
        ]
        coordinates = [[[round(x, 6), round(y, 6)] for x, y in ring]]

    return {
        "type": "Feature",
        "id": str(uuid.uuid4()),
        "geometry": {"type": geometry_type, "coordinates": coordinates},
        "properties": {},
    }
