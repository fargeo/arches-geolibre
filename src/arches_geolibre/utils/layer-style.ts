import type { ArchesNodeMapStyle } from "@/arches_geolibre/types.ts";

// Arches' defaults for a geometry node with no styling of its own.
const DEFAULT_FILL_COLOR = "rgba(130, 130, 130, 0.5)";
const DEFAULT_LINE_COLOR = "rgba(130, 130, 130, 0.7)";
const DEFAULT_POINT_COLOR = "rgba(130, 130, 130, 0.7)";
const DEFAULT_OUTLINE_COLOR = "rgba(200, 200, 200, 0.7)";
const DEFAULT_LINE_WIDTH = 2;
const DEFAULT_POINT_RADIUS = 2;

/**
 * A Mapbox GL style describing how Arches draws this node, for GeoLibre's
 * `importLayerStyle`, which maps it onto the layer's own symbology.
 */
export function buildArchesLayerStyle(
    nodeMapStyle: ArchesNodeMapStyle = {},
): string {
    const lineWidth = nodeMapStyle.weight ?? DEFAULT_LINE_WIDTH;
    return JSON.stringify({
        version: 8,
        sources: {},
        layers: [
            {
                id: "arches-fill",
                type: "fill",
                paint: {
                    "fill-color": nodeMapStyle.fillColor ?? DEFAULT_FILL_COLOR,
                    "fill-outline-color":
                        nodeMapStyle.outlineColor ?? DEFAULT_OUTLINE_COLOR,
                },
            },
            {
                id: "arches-line",
                type: "line",
                paint: {
                    "line-color": nodeMapStyle.lineColor ?? DEFAULT_LINE_COLOR,
                    "line-width": lineWidth,
                },
            },
            {
                id: "arches-point",
                type: "circle",
                paint: {
                    "circle-color":
                        nodeMapStyle.pointColor ?? DEFAULT_POINT_COLOR,
                    "circle-radius":
                        (nodeMapStyle.radius ?? DEFAULT_POINT_RADIUS) +
                        lineWidth,
                    "circle-stroke-color":
                        nodeMapStyle.outlineColor ?? DEFAULT_OUTLINE_COLOR,
                    "circle-stroke-width": 1,
                },
            },
        ],
    });
}
