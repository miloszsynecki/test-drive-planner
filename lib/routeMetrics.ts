import type { LatLng } from "@/types/route";

type RouteLeg = {
  distanceMeters?: number;
  durationMillis?: number;
};

type RouteShape = {
  path?: Array<{ lat?: number | (() => number); lng?: number | (() => number) }>;
  legs?: RouteLeg[];
};

export function getPathFromRoute(route: unknown): LatLng[] {
  const rawPath = (route as RouteShape).path ?? [];
  return rawPath
    .map((point) => {
      const lat = typeof point.lat === "function" ? point.lat() : point.lat;
      const lng = typeof point.lng === "function" ? point.lng() : point.lng;
      if (typeof lat !== "number" || typeof lng !== "number") return null;
      return { lat, lng };
    })
    .filter((p): p is LatLng => Boolean(p));
}

export function getLegs(route: unknown): RouteLeg[] {
  return (route as RouteShape).legs ?? [];
}

export function getDurationMinutes(route: unknown): number {
  const totalMillis = getLegs(route).reduce(
    (sum, leg) => sum + Number(leg.durationMillis ?? 0),
    0,
  );
  return totalMillis / 1000 / 60;
}

const DEG_TO_RAD = Math.PI / 180;
const METERS_PER_DEG_LAT = 110_540;
const METERS_PER_DEG_LNG = 111_320;

// Project a point to local planar meters relative to a reference latitude.
// Equirectangular is accurate enough at the scale of a single test-drive loop
// and, unlike rounding raw lat/lng to fixed decimals, does not distort with
// longitude as latitude increases.
function toLocalMeters(point: LatLng, ref: LatLng): { x: number; y: number } {
  const x = (point.lng - ref.lng) * METERS_PER_DEG_LNG * Math.cos(ref.lat * DEG_TO_RAD);
  const y = (point.lat - ref.lat) * METERS_PER_DEG_LAT;
  return { x, y };
}

function bearingDegrees(from: { x: number; y: number }, to: { x: number; y: number }): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}

// Smallest absolute angle between two bearings, in [0, 180]. Computed without
// relying on the sign of JS's % operator, which is negative for negative
// operands and would otherwise misreport turns near the 180° wraparound.
function angleDelta(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

// Resample a path into segments of at least `minSegmentMeters`, so that the
// dense, near-collinear vertices Google returns do not register as turns.
function simplifyToSegments(path: LatLng[], minSegmentMeters: number): { x: number; y: number }[] {
  if (path.length === 0) return [];
  const ref = path[0];
  const projected = path.map((p) => toLocalMeters(p, ref));
  const kept: { x: number; y: number }[] = [projected[0]];
  for (let i = 1; i < projected.length; i += 1) {
    const last = kept[kept.length - 1];
    const dx = projected[i].x - last.x;
    const dy = projected[i].y - last.y;
    if (Math.hypot(dx, dy) >= minSegmentMeters) kept.push(projected[i]);
  }
  return kept;
}

// Geometric U-turn detection: count points where the heading reverses by ~180°.
// Language-independent, unlike parsing navigation-instruction text.
export function getUTurnCount(route: unknown, reversalThresholdDeg = 150): number {
  const points = simplifyToSegments(getPathFromRoute(route), 20);
  if (points.length < 3) return 0;

  let count = 0;
  for (let i = 2; i < points.length; i += 1) {
    const incoming = bearingDegrees(points[i - 2], points[i - 1]);
    const outgoing = bearingDegrees(points[i - 1], points[i]);
    if (angleDelta(incoming, outgoing) >= reversalThresholdDeg) count += 1;
  }
  return count;
}

// Overlap ratio: fraction of the route's footprint (cells of `cellMeters`) that
// is traversed by two or more distinct, non-adjacent segments. Sampling along
// each segment catches a road driven twice even when the returned vertices do
// not coincide, and the meters-based grid catches near-parallel passes.
export function getOverlapRatio(route: unknown, cellMeters = 25): number {
  const path = getPathFromRoute(route);
  if (path.length < 2) return 0;

  const ref = path[0];
  const projected = path.map((p) => toLocalMeters(p, ref));
  const cellSegments = new Map<string, Set<number>>();
  const step = cellMeters / 2;

  for (let i = 1; i < projected.length; i += 1) {
    const a = projected[i - 1];
    const b = projected[i];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const samples = Math.max(1, Math.ceil(length / step));
    for (let s = 0; s <= samples; s += 1) {
      const t = s / samples;
      const cx = Math.floor((a.x + (b.x - a.x) * t) / cellMeters);
      const cy = Math.floor((a.y + (b.y - a.y) * t) / cellMeters);
      const key = `${cx}:${cy}`;
      const set = cellSegments.get(key);
      if (set) set.add(i);
      else cellSegments.set(key, new Set([i]));
    }
  }

  if (cellSegments.size === 0) return 0;
  let revisited = 0;
  for (const segments of cellSegments.values()) {
    // Consecutive segments naturally share their junction cell; that is not
    // overlap. Only count a cell when it is touched by non-adjacent segments,
    // i.e. the route genuinely passes through the same place twice.
    if (segments.size < 2) continue;
    let min = Infinity;
    let max = -Infinity;
    for (const index of segments) {
      if (index < min) min = index;
      if (index > max) max = index;
    }
    if (max - min >= 2) revisited += 1;
  }
  return revisited / cellSegments.size;
}

export function makeFingerprint(route: unknown): string {
  const path = getPathFromRoute(route);
  return path
    .filter((_, idx) => idx % 4 === 0)
    .map((p) => `${p.lat.toFixed(3)}:${p.lng.toFixed(3)}`)
    .join("|");
}
