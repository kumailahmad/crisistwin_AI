from shapely.geometry import shape

from app.core.config import settings


class GeometryError(ValueError):
    pass


def validate_polygon(geometry: dict) -> dict:
    if geometry.get("type") not in ("Polygon", "MultiPolygon"):
        raise GeometryError("Geometry must be a Polygon or MultiPolygon in EPSG:4326")
    try:
        geom = shape(geometry)
    except Exception as exc:  # shapely raises several types
        raise GeometryError("Malformed GeoJSON geometry") from exc
    if geom.is_empty or not geom.is_valid:
        raise GeometryError("Geometry is empty or invalid")
    minx, miny, maxx, maxy = geom.bounds
    if not (-180 <= minx and maxx <= 180 and -90 <= miny and maxy <= 90):
        raise GeometryError("Coordinates are not valid longitude/latitude values")
    if not (settings.bbox_min_lon - 1 <= minx and maxx <= settings.bbox_max_lon + 1
            and settings.bbox_min_lat - 1 <= miny and maxy <= settings.bbox_max_lat + 1):
        raise GeometryError("Geometry lies outside the Balochistan study area")
    return geometry
