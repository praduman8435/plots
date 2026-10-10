/**
 * Small, dependency-free geometry helpers for the parcel map (pure; used by
 * the importer, the APIs and the tests). Coordinates are GeoJSON order
 * [longitude, latitude] in WGS 84 (EPSG:4326) unless stated otherwise.
 */

export type Position = [number, number];
export type Ring = Position[];
export type PolygonCoords = Ring[];
export type PolygonGeometry = { type: "Polygon"; coordinates: PolygonCoords };
export type MultiPolygonGeometry = { type: "MultiPolygon"; coordinates: PolygonCoords[] };
export type AreaGeometry = PolygonGeometry | MultiPolygonGeometry;
export type BBox = { west: number; south: number; east: number; north: number };

/** Gautam Buddha Nagar with a margin — anything outside is not a Noida-area parcel. */
export const GBN_BOUNDS: BBox = { west: 77.2, south: 27.9, east: 77.85, north: 28.7 };

export const LIMITS = {
  /** Vertices in one polygon (all rings). Real cadastral plots have tens to a few hundred. */
  maxVertices: 5000,
  /** Rings in one polygon (outer + holes). */
  maxRings: 50,
  /** Parts in one MultiPolygon. */
  maxParts: 50,
  /** Widest/tallest parcel (≈ 2.2 km). Bigger shapes are villages or errors, not plots — and the grid index relies on it. */
  maxSpanDeg: 0.02,
};

/** Viewport index: parcels are filed under the 0.01° grid cell of their south-west corner. */
export const CELL_DEG = 0.01;
export const cellOf = (deg: number) => Math.floor(deg / CELL_DEG);

/** Cell ranges that can hold a parcel overlapping `b` (a parcel starts at most maxSpanDeg before it). */
export function cellRange(b: BBox) {
  return { x0: cellOf(b.west - LIMITS.maxSpanDeg), x1: cellOf(b.east), y0: cellOf(b.south - LIMITS.maxSpanDeg), y1: cellOf(b.north) };
}

export function polygons(g: AreaGeometry): PolygonCoords[] {
  return g.type === "Polygon" ? [g.coordinates] : g.coordinates;
}

// ───────────────────────────── Coordinate reference systems ─────────────────────────────

/** CRSs the importer understands. Others must be converted first (e.g. ogr2ogr -t_srs EPSG:4326). */
export const SUPPORTED_CRS = ["EPSG:4326", "EPSG:3857", "EPSG:32643", "EPSG:32644", "EPSG:7755"] as const;
export type SupportedCrs = (typeof SUPPORTED_CRS)[number];

/** "urn:ogc:def:crs:OGC:1.3:CRS84", "EPSG:4326", "urn:ogc:def:crs:EPSG::32643" → a supported code, or null. */
export function normalizeCrs(name: string | undefined | null): SupportedCrs | null {
  if (!name) return "EPSG:4326"; // RFC 7946: GeoJSON without a crs member is WGS 84
  const n = name.trim().toUpperCase();
  if (/CRS84$/.test(n) || /(^|:)4326$/.test(n)) return "EPSG:4326";
  const code = /(\d{4,5})$/.exec(n)?.[1];
  if (code === "3857" || code === "900913") return "EPSG:3857";
  if (code === "32643") return "EPSG:32643";
  if (code === "32644") return "EPSG:32644";
  if (code === "7755") return "EPSG:7755";
  return null;
}

const WGS84_A = 6378137;
const WGS84_F = 1 / 298.257223563;

/** Web Mercator metres → lon/lat. */
function fromWebMercator([x, y]: Position): Position {
  const lon = (x / WGS84_A) * (180 / Math.PI);
  const lat = (Math.atan(Math.exp(y / WGS84_A)) * 2 - Math.PI / 2) * (180 / Math.PI);
  return [lon, lat];
}

/** UTM (northern hemisphere, WGS 84) easting/northing → lon/lat. Standard series inverse (sub-millimetre for India). */
function fromUtmNorth([easting, northing]: Position, zone: number): Position {
  const k0 = 0.9996;
  const e2 = WGS84_F * (2 - WGS84_F);
  const ep2 = e2 / (1 - e2);
  const x = easting - 500000;
  const m = northing / k0;
  const mu = m / (WGS84_A * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const sin1 = Math.sin(phi1);
  const cos1 = Math.cos(phi1);
  const tan1 = Math.tan(phi1);
  const n1 = WGS84_A / Math.sqrt(1 - e2 * sin1 ** 2);
  const t1 = tan1 ** 2;
  const c1 = ep2 * cos1 ** 2;
  const r1 = (WGS84_A * (1 - e2)) / (1 - e2 * sin1 ** 2) ** 1.5;
  const d = x / (n1 * k0);
  const lat =
    phi1 -
    ((n1 * tan1) / r1) *
      (d ** 2 / 2 - ((5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * ep2) * d ** 4) / 24 + ((61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * ep2 - 3 * c1 ** 2) * d ** 6) / 720);
  const lon0 = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180);
  const lon = lon0 + (d - ((1 + 2 * t1 + c1) * d ** 3) / 6 + ((5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * ep2 + 24 * t1 ** 2) * d ** 5) / 120) / cos1;
  return [lon * (180 / Math.PI), lat * (180 / Math.PI)];
}

/**
 * EPSG:7755 "WGS 84 / India NSF LCC" (Lambert Conformal Conic, 2 standard
 * parallels 12°28'22.638"N and 35°10'22.096"N, origin 24°N 80°E, false
 * easting/northing 4,000,000 m) — used by Survey of India / national datasets.
 * Ellipsoidal inverse, Snyder (1987) eq. 15-1…15-11, 7-9.
 */
const LCC_7755 = (() => {
  const e = Math.sqrt(WGS84_F * (2 - WGS84_F));
  const rad = Math.PI / 180;
  const m = (phi: number) => Math.cos(phi) / Math.sqrt(1 - (e * Math.sin(phi)) ** 2);
  const t = (phi: number) => Math.tan(Math.PI / 4 - phi / 2) / ((1 - e * Math.sin(phi)) / (1 + e * Math.sin(phi))) ** (e / 2);
  const phi1 = 12.472955 * rad;
  const phi2 = 35.17280444444444 * rad;
  const phi0 = 24 * rad;
  const n = (Math.log(m(phi1)) - Math.log(m(phi2))) / (Math.log(t(phi1)) - Math.log(t(phi2)));
  const F = m(phi1) / (n * t(phi1) ** n);
  const rho0 = WGS84_A * F * t(phi0) ** n;
  return { e, n, F, rho0, lon0: 80 * rad, x0: 4_000_000, y0: 4_000_000 };
})();

function fromIndiaLcc([x, y]: Position): Position {
  const { e, n, F, rho0, lon0, x0, y0 } = LCC_7755;
  const dx = x - x0;
  const dy = rho0 - (y - y0);
  const rho = Math.sign(n) * Math.hypot(dx, dy);
  const theta = Math.atan2(dx, dy);
  const tt = (rho / (WGS84_A * F)) ** (1 / n);
  let phi = Math.PI / 2 - 2 * Math.atan(tt);
  for (let i = 0; i < 10; i++) {
    const next = Math.PI / 2 - 2 * Math.atan(tt * ((1 - e * Math.sin(phi)) / (1 + e * Math.sin(phi))) ** (e / 2));
    if (Math.abs(next - phi) < 1e-12) {
      phi = next;
      break;
    }
    phi = next;
  }
  return [((theta / n + lon0) * 180) / Math.PI, (phi * 180) / Math.PI];
}

/** One position from `crs` to WGS 84 lon/lat. */
export function toWgs84(p: Position, crs: SupportedCrs): Position {
  switch (crs) {
    case "EPSG:4326":
      return [p[0], p[1]];
    case "EPSG:3857":
      return fromWebMercator(p);
    case "EPSG:32643":
      return fromUtmNorth(p, 43);
    case "EPSG:32644":
      return fromUtmNorth(p, 44);
    case "EPSG:7755":
      return fromIndiaLcc(p);
  }
}

export function transformGeometry(g: AreaGeometry, crs: SupportedCrs): AreaGeometry {
  if (crs === "EPSG:4326") return g;
  const ring = (r: Ring) => r.map((p) => toWgs84(p, crs));
  return g.type === "Polygon"
    ? { type: "Polygon", coordinates: g.coordinates.map(ring) }
    : { type: "MultiPolygon", coordinates: g.coordinates.map((poly) => poly.map(ring)) };
}

// ───────────────────────────── Validation ─────────────────────────────

export type GeometryCheck = { ok: true; geometry: AreaGeometry } | { ok: false; reason: string };

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Structural + topological checks for a parcel (already in WGS 84):
 * Polygon/MultiPolygon only, finite coordinates inside `bounds`, closed rings
 * of ≥ 4 positions, no self-intersecting rings, and size limits. Rings left
 * open by a sloppy export are closed; nothing else is "repaired".
 */
export function validateAreaGeometry(input: unknown, bounds: BBox = GBN_BOUNDS): GeometryCheck {
  const g = input as { type?: unknown; coordinates?: unknown } | null;
  if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon") || !Array.isArray(g.coordinates)) {
    return { ok: false, reason: "not a Polygon or MultiPolygon" };
  }
  const parts = (g.type === "Polygon" ? [g.coordinates] : g.coordinates) as unknown[];
  if (parts.length === 0) return { ok: false, reason: "no coordinates" };
  if (parts.length > LIMITS.maxParts) return { ok: false, reason: `more than ${LIMITS.maxParts} parts` };

  const out: PolygonCoords[] = [];
  let vertices = 0;
  for (const part of parts) {
    if (!Array.isArray(part) || part.length === 0) return { ok: false, reason: "empty polygon" };
    if (part.length > LIMITS.maxRings) return { ok: false, reason: `more than ${LIMITS.maxRings} rings` };
    const rings: Ring[] = [];
    for (const rawRing of part) {
      if (!Array.isArray(rawRing)) return { ok: false, reason: "ring is not an array" };
      const ring: Ring = [];
      for (const p of rawRing) {
        if (!Array.isArray(p) || p.length < 2 || !isNum(p[0]) || !isNum(p[1])) return { ok: false, reason: "invalid coordinate" };
        const [lng, lat] = p;
        if (lng < bounds.west || lng > bounds.east || lat < bounds.south || lat > bounds.north) {
          return { ok: false, reason: "coordinate outside the supported area (wrong CRS?)" };
        }
        ring.push([lng, lat]);
      }
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (ring.length > 0 && (first[0] !== last[0] || first[1] !== last[1])) ring.push([first[0], first[1]]);
      if (ring.length < 4) return { ok: false, reason: "ring has fewer than 4 positions" };
      vertices += ring.length;
      if (vertices > LIMITS.maxVertices) return { ok: false, reason: `more than ${LIMITS.maxVertices} vertices` };
      if (ringSelfIntersects(ring)) return { ok: false, reason: "self-intersecting ring" };
      rings.push(ring);
    }
    if (Math.abs(ringAreaSqm(rings[0])) < 0.01) return { ok: false, reason: "zero-area polygon" };
    out.push(rings);
  }
  const geometry: AreaGeometry = g.type === "Polygon" ? { type: "Polygon", coordinates: out[0] } : { type: "MultiPolygon", coordinates: out };
  const b = bboxOf(geometry);
  if (b.east - b.west > LIMITS.maxSpanDeg || b.north - b.south > LIMITS.maxSpanDeg) return { ok: false, reason: "larger than a land parcel (over ~2 km across)" };
  return { ok: true, geometry };
}

function orient(a: Position, b: Position, c: Position) {
  const v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

function onSegment(a: Position, b: Position, p: Position) {
  return Math.min(a[0], b[0]) <= p[0] && p[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= p[1] && p[1] <= Math.max(a[1], b[1]);
}

function segmentsIntersect(p1: Position, p2: Position, q1: Position, q2: Position) {
  const o1 = orient(p1, p2, q1);
  const o2 = orient(p1, p2, q2);
  const o3 = orient(q1, q2, p1);
  const o4 = orient(q1, q2, p2);
  if (o1 !== o2 && o3 !== o4) return true;
  return (o1 === 0 && onSegment(p1, p2, q1)) || (o2 === 0 && onSegment(p1, p2, q2)) || (o3 === 0 && onSegment(q1, q2, p1)) || (o4 === 0 && onSegment(q1, q2, p2));
}

/** True when two non-adjacent edges of a closed ring touch or cross (O(n²), n is capped). */
export function ringSelfIntersects(ring: Ring): boolean {
  const n = ring.length - 1; // edges
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue; // neighbours share a vertex
      if (segmentsIntersect(ring[i], ring[i + 1], ring[j], ring[j + 1])) return true;
    }
  }
  return false;
}

// ───────────────────────────── Measures ─────────────────────────────

/**
 * Geodesic ring area on the WGS 84 authalic sphere (the method used by
 * turf.js / Mapbox: Chamberlain & Duquette 2007). Signed; magnitude in m².
 */
export function ringAreaSqm(ring: Ring): number {
  const R = 6371008.8;
  const rad = Math.PI / 180;
  let total = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[i + 1];
    total += (lon2 - lon1) * rad * (2 + Math.sin(lat1 * rad) + Math.sin(lat2 * rad));
  }
  return (total * R * R) / 2;
}

/** Outer rings minus holes, in m². */
export function areaSqm(g: AreaGeometry): number {
  let total = 0;
  for (const poly of polygons(g)) {
    total += Math.abs(ringAreaSqm(poly[0]));
    for (const hole of poly.slice(1)) total -= Math.abs(ringAreaSqm(hole));
  }
  return Math.max(0, total);
}

export function bboxOf(g: AreaGeometry): BBox {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const poly of polygons(g)) {
    for (const [lng, lat] of poly[0]) {
      if (lng < west) west = lng;
      if (lng > east) east = lng;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    }
  }
  return { west, south, east, north };
}

/** Area-weighted centroid of the outer rings (good enough to place a label or fly to a parcel). */
export function centroidOf(g: AreaGeometry): Position {
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (const poly of polygons(g)) {
    const r = poly[0];
    for (let i = 0; i < r.length - 1; i++) {
      const f = r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
      cx += (r[i][0] + r[i + 1][0]) * f;
      cy += (r[i][1] + r[i + 1][1]) * f;
      a += f;
    }
  }
  if (Math.abs(a) < 1e-18) {
    const b = bboxOf(g);
    return [(b.west + b.east) / 2, (b.south + b.north) / 2];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

export function pointInRing([x, y]: Position, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInGeometry(p: Position, g: AreaGeometry): boolean {
  return polygons(g).some((poly) => pointInRing(p, poly[0]) && !poly.slice(1).some((hole) => pointInRing(p, hole)));
}

export function bboxIntersects(a: BBox, b: BBox): boolean {
  return a.west <= b.east && a.east >= b.west && a.south <= b.north && a.north >= b.south;
}

// ───────────────────────────── Simplification (display only) ─────────────────────────────

function perpDistance(p: Position, a: Position, b: Position) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function douglasPeucker(points: Position[], tolerance: number): Position[] {
  if (points.length <= 2) return points;
  let maxD = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDistance(points[i], points[0], points[points.length - 1]);
    if (d > maxD) {
      maxD = d;
      index = i;
    }
  }
  if (maxD <= tolerance) return [points[0], points[points.length - 1]];
  return [...douglasPeucker(points.slice(0, index + 1), tolerance).slice(0, -1), ...douglasPeucker(points.slice(index), tolerance)];
}

/** Ring simplified for drawing; never below 4 positions (falls back to the original ring). */
export function simplifyRing(ring: Ring, toleranceDeg: number): Ring {
  const s = douglasPeucker(ring, toleranceDeg);
  return s.length >= 4 ? s : ring;
}

/** Display copy of a geometry. The stored source geometry is never simplified. */
export function simplifyGeometry(g: AreaGeometry, toleranceDeg: number): AreaGeometry {
  const poly = (p: PolygonCoords) => p.map((r) => simplifyRing(r, toleranceDeg));
  return g.type === "Polygon" ? { type: "Polygon", coordinates: poly(g.coordinates) } : { type: "MultiPolygon", coordinates: g.coordinates.map(poly) };
}

/** Rounds coordinates (7 decimals ≈ 1 cm) to keep responses small. */
export function roundGeometry(g: AreaGeometry, decimals = 7): AreaGeometry {
  const f = 10 ** decimals;
  const r = (ring: Ring) => ring.map(([x, y]) => [Math.round(x * f) / f, Math.round(y * f) / f] as Position);
  return g.type === "Polygon" ? { type: "Polygon", coordinates: g.coordinates.map(r) } : { type: "MultiPolygon", coordinates: g.coordinates.map((p) => p.map(r)) };
}
