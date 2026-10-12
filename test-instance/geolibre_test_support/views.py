"""
Local stand-ins for planned Arches core fixes, so the plugin can be tested
against an unpatched Arches 8.1. Remove each once core ships its fix.

FixedGeoJSON: the body of ``get`` is core 8.1's ``arches.app.views.api.geo.GeoJSON.get``
with four changes:

1. Resource-level permissions are checked per tile. Core reads ``tile``
   before it is bound, which raises UnboundLocalError on every request.
2. ``resourceid`` is optional. Core calls ``resourceid.split`` unguarded.
3. Each feature reports its stored UUID as ``properties.featureid`` before
   ``id`` is replaced with a running number, and the primary name comes from
   the resource's stored name rather than a misdirected descriptor call.
4. Tiles are fetched with their resource instance, so ``include_primary_name``
   doesn't run one query per feature.
"""

from django.core.exceptions import ObjectDoesNotExist
from django.db import transaction
from django.urls import reverse
from django.utils.decorators import method_decorator
from django.utils.translation import gettext as _
from slugify import slugify

from arches.app.datatypes.datatypes import DataTypeFactory
from arches.app.models import models
from arches.app.models.tile import Tile as TileProxyModel
from arches.app.utils.decorators import group_required
from arches.app.utils.geo_utils import GeoUtils
from arches.app.utils.permission_backend import (
    get_filtered_instances,
    user_can_edit_resource,
    user_is_resource_reviewer,
)
from arches.app.utils.response import JSONResponse
from arches.app.views.api.geo import GeoJSON
from arches.app.views.api.tile import Tile


class FixedGeoJSON(GeoJSON):
    def get_name(self, resource):
        # FIX 3: core passes the view, not the resource, to the descriptor function.
        return str(resource.name)

    def get(self, request):
        datatype_factory = DataTypeFactory()
        set_precision = GeoUtils().set_precision
        resourceid = request.GET.get("resourceid", None)
        nodeid = request.GET.get("nodeid", None)
        nodeids = request.GET.get("nodeids", None)
        tileid = request.GET.get("tileid", None)
        nodegroups = request.GET.get("nodegroups", [])
        precision = request.GET.get("precision", None)
        field_name_length = int(request.GET.get("field_name_length", 0))
        use_uuid_names = bool(request.GET.get("use_uuid_names", False))
        include_primary_name = bool(request.GET.get("include_primary_name", False))
        include_geojson_link = bool(request.GET.get("include_geojson_link", False))
        use_display_values = bool(request.GET.get("use_display_values", False))
        geometry_type = request.GET.get("type", None)
        indent = request.GET.get("indent", None)
        limit = request.GET.get("limit", None)
        page = int(request.GET.get("page", 1))
        if limit is not None:
            limit = int(limit)
        if indent is not None:
            indent = int(indent)
        if isinstance(nodegroups, str):
            nodegroups = nodegroups.split(",")
        viewable_nodegroups = request.user.userprofile.viewable_nodegroups
        nodegroups = [i for i in nodegroups if i in viewable_nodegroups]
        nodes = models.Node.objects.filter(
            datatype="geojson-feature-collection", nodegroup_id__in=viewable_nodegroups
        )
        node_filter = []
        if nodeids:
            node_filter += nodeids.split(",")
        if nodeid:
            node_filter.append(nodeid)
        nodes = nodes.filter(nodeid__in=node_filter)
        features = []
        i = 1
        property_tiles = models.TileModel.objects.filter(nodegroup_id__in=nodegroups)
        property_node_map = {}
        property_nodes = models.Node.objects.filter(nodegroup_id__in=nodegroups)
        # FIX 2: resourceid is optional.
        requested_resource_ids = resourceid.split(",") if resourceid else None
        exclusive_set, filtered_instance_ids = get_filtered_instances(
            request.user, self.se, resources=requested_resource_ids
        )
        for node in property_nodes:
            property_node_map[str(node.nodeid)] = {"node": node}
            if node.fieldname is None or node.fieldname == "":
                property_node_map[str(node.nodeid)]["name"] = slugify(
                    node.name, max_length=field_name_length, separator="_"
                )
            else:
                property_node_map[str(node.nodeid)]["name"] = node.fieldname
        tiles = models.TileModel.objects.filter(
            nodegroup_id__in=[node.nodegroup_id for node in nodes]
        ).select_related("resourceinstance")
        last_page = None
        if requested_resource_ids is not None:
            tiles = tiles.filter(resourceinstance_id__in=requested_resource_ids)
        if tileid is not None:
            tiles = tiles.filter(tileid=tileid)
        tiles = tiles.order_by("sortorder", "tileid")
        # FIX 1: check each tile's resource instead of an unbound `tile`.
        filtered_instance_ids = set(filtered_instance_ids)
        tiles = [
            tile
            for tile in tiles
            if (str(tile.resourceinstance_id) in filtered_instance_ids) == exclusive_set
        ]
        if limit is not None:
            start = (page - 1) * limit
            end = start + limit
            last_page = len(tiles) < end
            tiles = tiles[start:end]
        for tile in tiles:
            data = tile.data
            for node in nodes:
                try:
                    for feature_index, feature in enumerate(
                        data[str(node.pk)]["features"]
                    ):
                        if (
                            geometry_type is None
                            or geometry_type == feature["geometry"]["type"]
                        ):
                            if len(nodegroups) > 0:
                                for pt in property_tiles.filter(
                                    resourceinstance_id=tile.resourceinstance_id
                                ).order_by("sortorder"):
                                    for key in pt.data:
                                        field_name = (
                                            key
                                            if use_uuid_names
                                            else property_node_map[key]["name"]
                                        )
                                        if pt.data[key] is not None:
                                            if use_display_values:
                                                property_node = property_node_map[key][
                                                    "node"
                                                ]
                                                datatype = (
                                                    datatype_factory.get_instance(
                                                        property_node.datatype
                                                    )
                                                )
                                                value = datatype.get_display_value(
                                                    pt, property_node
                                                )
                                            else:
                                                value = pt.data[key]
                                            try:
                                                feature["properties"][
                                                    field_name
                                                ].append(value)
                                            except KeyError:
                                                feature["properties"][
                                                    field_name
                                                ] = value
                                            except AttributeError:
                                                feature["properties"][field_name] = [
                                                    feature["properties"][field_name],
                                                    value,
                                                ]
                            if include_primary_name:
                                feature["properties"]["primary_name"] = self.get_name(
                                    tile.resourceinstance
                                )
                            feature["properties"][
                                "resourceinstanceid"
                            ] = tile.resourceinstance_id
                            feature["properties"]["tileid"] = tile.pk
                            try:
                                feature["properties"].pop("nodeId")
                            except KeyError:
                                pass
                            feature["properties"]["nodeid"] = node.pk
                            if include_geojson_link:
                                feature["properties"]["geojson"] = (
                                    "%s?tileid=%s&nodeid=%s"
                                    % (
                                        reverse("geojson"),
                                        tile.pk,
                                        node.pk,
                                    )
                                )
                            # FIX 3: keep the stored feature UUID visible to clients.
                            if "id" in feature:
                                feature["properties"]["featureid"] = feature["id"]
                            feature["id"] = i
                            if precision is not None:
                                coordinates = set_precision(
                                    feature["geometry"]["coordinates"], precision
                                )
                                feature["geometry"]["coordinates"] = coordinates
                            i += 1
                            features.append(feature)
                except KeyError:
                    pass
                except TypeError:
                    pass

        feature_collection = {"type": "FeatureCollection", "features": features}
        if last_page is not None:
            feature_collection["_page"] = page
            feature_collection["_lastPage"] = last_page

        response = JSONResponse(feature_collection, indent=indent)
        return response


class TileWithDelete(Tile):
    """
    A local stand-in for the planned DELETE on /api/tiles/<tileid>. Core 8.1
    can only delete tiles through /tile, which token clients can't reach
    because it requires a CSRF token. The rules are core's TileData.delete:
    reviewers may delete any tile, others only tiles that are still
    provisional, and only on an active resource model.
    """

    @method_decorator(group_required("Resource Editor", raise_exception=True))
    def delete(self, request, tileid):
        try:
            tile = TileProxyModel.objects.get(tileid=tileid)
        except ObjectDoesNotExist:
            return JSONResponse(_("Tile not found."), status=404)
        if not user_can_edit_resource(request.user, tile.resourceinstance_id):
            return JSONResponse(
                _("User is not permitted to edit this resource"), status=403
            )
        user_is_reviewer = user_is_resource_reviewer(request.user)
        if not (user_is_reviewer or tile.is_provisional()):
            return JSONResponse(
                _(
                    "You do not have permissions to delete a tile with authoritative data."
                ),
                status=403,
            )
        if not tile.resourceinstance.graph.is_active:
            return JSONResponse(_("The resource model is not active."), status=409)
        if not tile.filter_by_perm(request.user, "delete_nodegroup"):
            return JSONResponse(_("Permission Denied"), status=403)
        with transaction.atomic():
            tile.delete(request=request)
            tile.after_update_all()
        return JSONResponse(tile)
