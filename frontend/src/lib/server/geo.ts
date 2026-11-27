export const BBOX = { minLon: 60.8, maxLon: 70.6, minLat: 24.0, maxLat: 32.2 };

export function inBalochistan(lat: number, lon: number): boolean {
  return lat >= BBOX.minLat && lat <= BBOX.maxLat && lon >= BBOX.minLon && lon <= BBOX.maxLon;
}

export function validatePolygon(geometry: unknown): string | null {
  if (!geometry || typeof geometry !== "object") return "Invalid GeoJSON geometry";
  const g = geometry as { type?: string; coordinates?: unknown };
  if (g.type !== "Polygon" && g.type !== "MultiPolygon") {
    return "Geometry must be a Polygon or MultiPolygon";
  }
  if (!Array.isArray(g.coordinates) || g.coordinates.length === 0) {
    return "Geometry has no coordinates";
  }
  return null;
}

function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPoly(lon: number, lat: number, coords: number[][][]): boolean {
  if (!coords.length || !pointInRing(lon, lat, coords[0])) return false;
  for (let i = 1; i < coords.length; i++) {
    if (pointInRing(lon, lat, coords[i])) return false;
  }
  return true;
}

export type BBoxTuple = [number, number, number, number];
const bboxCache = new WeakMap<GeoJSON.Geometry, BBoxTuple>();

function scanRingBounds(ring: number[][], out: BBoxTuple): void {
  for (let i = 0; i < ring.length; i++) {
    const lon = ring[i][0];
    const lat = ring[i][1];
    if (lon < out[0]) out[0] = lon;
    if (lat < out[1]) out[1] = lat;
    if (lon > out[2]) out[2] = lon;
    if (lat > out[3]) out[3] = lat;
  }
}

export function geometryBBox(geometry: GeoJSON.Geometry): BBoxTuple | null {
  const hit = bboxCache.get(geometry);
  if (hit) return hit;
  const out: BBoxTuple = [Infinity, Infinity, -Infinity, -Infinity];
  if (geometry.type === "Polygon") {
    for (const ring of geometry.coordinates) scanRingBounds(ring, out);
  } else if (geometry.type === "MultiPolygon") {
    for (const poly of geometry.coordinates) {
      for (const ring of poly) scanRingBounds(ring, out);
    }
  } else {
    return null;
  }
  if (!Number.isFinite(out[0])) return null;
  bboxCache.set(geometry, out);
  return out;
}

export function pointInGeometry(lat: number, lon: number, geometry: GeoJSON.Geometry): boolean {
  const box = geometryBBox(geometry);
  if (box && (lon < box[0] || lon > box[2] || lat < box[1] || lat > box[3])) {
    return false;
  }
  if (geometry.type === "Polygon") {
    return pointInPoly(lon, lat, geometry.coordinates);
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((poly) => pointInPoly(lon, lat, poly));
  }
  return false;
}

export function kmBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * p) / 2) ** 2 +
    Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(((lon2 - lon1) * p) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}
