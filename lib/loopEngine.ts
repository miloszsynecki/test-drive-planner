import {
  getDurationMinutes,
  getLegs,
  getOverlapRatio,
  getPathFromRoute,
  getUTurnCount,
  makeFingerprint,
} from "@/lib/routeMetrics";
import type { LatLng, LoopSize } from "@/types/route";

// Seed assumption only — the engine measures the loop's real duration from
// Google's returned legs and corrects the radius, so this just sizes the first
// attempt. It is never reported as the result.
export const SEED_SPEED_KMH = 40;

// Compact loops stay near the dealership; wide loops roam further for the same
// target duration.
export const LOOP_SIZE_BIAS: Record<LoopSize, number> = {
  compact: 0.82,
  standard: 1,
  wide: 1.22,
};

const DURATION_TOLERANCE = 0.2;
const RADIUS_ADJUST_MIN = 0.6;
const RADIUS_ADJUST_MAX = 1.6;

type ComputeLeg = (from: LatLng, to: LatLng) => Promise<unknown>;

type RouteLeg = { distanceMeters?: number; durationMillis?: number };

type SyntheticRoute = { path: LatLng[]; legs: RouteLeg[] };

type PlanLoopInput = {
  origin: LatLng;
  durationMinutes: number;
  loopSize: LoopSize;
  computeLeg: ComputeLeg;
  recentFingerprints?: string[];
  onProgress?: (message: string) => void;
  /** Injectable RNG for deterministic tests. Defaults to Math.random. */
  random?: () => number;
  maxAttempts?: number;
};

export type LoopResult = {
  route: SyntheticRoute;
  waypoints: LatLng[];
  durationMinutes: number;
  distanceKm: number;
  uturnCount: number;
  overlapRatio: number;
  fingerprint: string;
  qualityNotice: boolean;
};

// More vertices = a rounder loop. Longer drives get more so the polygon does not
// have to stretch unnaturally far to hit the target duration.
function vertexCount(durationMinutes: number): number {
  if (durationMinutes <= 20) return 3;
  if (durationMinutes <= 45) return 4;
  return 5;
}

// Planar lat/lng offset at a bearing and radius. Accurate enough at the scale of
// a single test-drive loop.
function vertexAt(origin: LatLng, angleDeg: number, radiusKm: number): LatLng {
  const angleRad = (angleDeg * Math.PI) / 180;
  const centerLatRad = (origin.lat * Math.PI) / 180;
  return {
    lat: origin.lat + (radiusKm / 111) * Math.cos(angleRad),
    lng: origin.lng + (radiusKm / (111 * Math.cos(centerLatRad))) * Math.sin(angleRad),
  };
}

function distSq(a: LatLng, b: LatLng): number {
  return (a.lat - b.lat) ** 2 + (a.lng - b.lng) ** 2;
}

function samePoint(a: LatLng, b: LatLng): boolean {
  return Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lng - b.lng) < 1e-7;
}

// The dead-end guard. The last point of a leg is wherever Google stopped — it may
// be a snapped driveway next to an unreachable ideal vertex. Choosing instead the
// interior path index closest to the ideal vertex (clamped to [1, len-2]) gives a
// genuine through-road point: the next leg departs from a place the optimal route
// already flowed through, so it continues forward instead of reversing back out.
function flowThroughIndex(path: LatLng[], ideal: LatLng): number {
  let bestIdx = 1;
  let bestDist = Infinity;
  for (let i = 1; i <= path.length - 2; i += 1) {
    const d = distSq(path[i], ideal);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

// Public wrapper used in tests: the through-road point itself.
export function flowThroughPoint(path: LatLng[], ideal: LatLng): LatLng {
  if (path.length === 0) return ideal;
  if (path.length <= 2) return path[path.length - 1];
  return path[flowThroughIndex(path, ideal)];
}

const DEG_TO_RAD = Math.PI / 180;

function segmentMeters(a: LatLng, b: LatLng): number {
  const dy = (b.lat - a.lat) * 111_320;
  const dx = (b.lng - a.lng) * 111_320 * Math.cos(((a.lat + b.lat) / 2) * DEG_TO_RAD);
  return Math.hypot(dx, dy);
}

function pathLength(path: LatLng[], end = path.length - 1): number {
  let total = 0;
  for (let i = 1; i <= end; i += 1) total += segmentMeters(path[i - 1], path[i]);
  return total;
}

// Remove out-and-back excursions (spurs / dead-ends) from a polyline.
//
// The flow-through guard stops a leg from being *forced* into a dead-end, but on
// a sparse or radial network a leg can still drive out along the only arterial
// and the next leg has to come back along it before heading elsewhere — a visible
// spur off the loop. Snapping each point to a coarse grid cell and cancelling
// immediate backtracks (the same reduction that turns a walk into its underlying
// cycle, like removing adjacent inverse pairs in a free group) collapses any
// out-and-back of any length while leaving genuine loops — which return via
// *different* cells — untouched.
export function removeBacktracks(path: LatLng[], cellMeters = 45): LatLng[] {
  if (path.length < 4) return path;

  const ref = path[0];
  const cosRef = Math.cos(ref.lat * DEG_TO_RAD);
  const cellOf = (p: LatLng): string => {
    const cx = Math.round(((p.lng - ref.lng) * 111_320 * cosRef) / cellMeters);
    const cy = Math.round(((p.lat - ref.lat) * 111_320) / cellMeters);
    return `${cx}:${cy}`;
  };

  const stack: Array<{ key: string; pts: LatLng[] }> = [];
  for (const p of path) {
    const key = cellOf(p);
    const top = stack[stack.length - 1];
    if (top && top.key === key) {
      top.pts.push(p); // still in the same cell — extend it
      continue;
    }
    const prev = stack[stack.length - 2];
    if (prev && prev.key === key) {
      stack.pop(); // stepped back to where we were — cancel the excursion tip
      continue;
    }
    stack.push({ key, pts: [p] });
  }

  const out: LatLng[] = [];
  for (const run of stack) for (const p of run.pts) out.push(p);
  return out;
}

// Evenly spaced interior points along a path, used as export waypoints. Sampling
// the *cleaned* loop means Google Maps / Waze re-trace the spur-free route rather
// than the raw one.
function sampleWaypoints(path: LatLng[], count: number): LatLng[] {
  if (path.length <= 2) return [];
  const interior = path.slice(1, -1);
  if (interior.length <= count) return interior;
  const result: LatLng[] = [];
  for (let i = 1; i <= count; i += 1) {
    const idx = Math.floor((interior.length - 1) * (i / (count + 1)));
    result.push(interior[idx]);
  }
  return result;
}

// Append a leg's path to the accumulator, skipping the shared junction vertex so
// the concatenated polyline has no duplicated points at the seams.
function appendPath(acc: LatLng[], next: LatLng[]): void {
  if (next.length === 0) return;
  const start = acc.length > 0 && samePoint(acc[acc.length - 1], next[0]) ? 1 : 0;
  for (let i = start; i < next.length; i += 1) acc.push(next[i]);
}

async function buildLoop(
  origin: LatLng,
  vertices: LatLng[],
  computeLeg: ComputeLeg,
): Promise<{ route: SyntheticRoute; waypoints: LatLng[] }> {
  const fullPath: LatLng[] = [];
  const legs: RouteLeg[] = [];
  const waypoints: LatLng[] = [];
  let anchor = origin;

  // Walk the vertices in angular order. Each leg starts from the real road point
  // the previous leg flowed through, so the loop sweeps around as a polygon. The
  // leg path is truncated at that flow-through point so the concatenated polyline
  // ends exactly where the next leg begins — no overshoot-then-backtrack seam.
  for (const ideal of vertices) {
    const leg = await computeLeg(anchor, ideal);
    const legPath = getPathFromRoute(leg);
    if (legPath.length < 2) continue;

    const cut = legPath.length <= 2 ? legPath.length - 1 : flowThroughIndex(legPath, ideal);
    appendPath(fullPath, legPath.slice(0, cut + 1));

    // Scale the leg's reported distance/duration to the retained portion so the
    // measured loop length matches the rendered (truncated) polyline.
    const retained = legPath.length > 1 ? pathLength(legPath, cut) / pathLength(legPath) : 1;
    const fraction = Number.isFinite(retained) && retained > 0 ? retained : 1;
    for (const l of getLegs(leg)) {
      legs.push({
        distanceMeters: Number(l.distanceMeters ?? 0) * fraction,
        durationMillis: Number(l.durationMillis ?? 0) * fraction,
      });
    }

    anchor = legPath[cut];
    waypoints.push(anchor);
  }

  // Close the loop back to the dealership (kept whole — it ends at the origin).
  const closing = await computeLeg(anchor, origin);
  appendPath(fullPath, getPathFromRoute(closing));
  for (const l of getLegs(closing)) legs.push(l);

  return { route: { path: fullPath, legs }, waypoints };
}

export async function planLoop(input: PlanLoopInput): Promise<LoopResult> {
  const random = input.random ?? Math.random;
  const maxAttempts = input.maxAttempts ?? 3;
  const recent = input.recentFingerprints ?? [];
  const n = vertexCount(input.durationMinutes);

  const estKm = (input.durationMinutes / 60) * SEED_SPEED_KMH;
  let radiusKm = (estKm / (2 * Math.PI)) * LOOP_SIZE_BIAS[input.loopSize];

  let best: (LoopResult & { score: number }) | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    input.onProgress?.(attempt === 0 ? "Building loop..." : "Refining loop length...");

    // Random start rotation so repeated "Generate another" clicks sweep a
    // different part of the network.
    const startAngle = random() * 360;
    const vertices = Array.from({ length: n }, (_, k) =>
      vertexAt(input.origin, startAngle + (k * 360) / n, radiusKm),
    );

    let built: { route: SyntheticRoute; waypoints: LatLng[] };
    try {
      built = await buildLoop(input.origin, vertices, input.computeLeg);
    } catch {
      continue;
    }
    if (built.route.path.length < 2) continue;

    // Cancel out-and-back spurs from the assembled loop, then measure the cleaned
    // route — that is what the user drives and what export should follow.
    const rawLength = pathLength(built.route.path);
    const cleanedPath = removeBacktracks(built.route.path);
    const cleanedLength = pathLength(cleanedPath);
    const lengthRatio = rawLength > 0 ? cleanedLength / rawLength : 1;
    const route: SyntheticRoute = { path: cleanedPath, legs: built.route.legs };

    // Trimming the spurs removes real (if pointless) driving, so scale the
    // measured duration down by the fraction of the polyline we kept.
    const durationMinutes = getDurationMinutes(built.route) * lengthRatio;
    const distanceKm = cleanedLength / 1000;
    const uturnCount = getUTurnCount(route);
    const overlapRatio = getOverlapRatio(route);
    const fingerprint = makeFingerprint(route);

    const durationError =
      input.durationMinutes > 0
        ? Math.abs(durationMinutes - input.durationMinutes) / input.durationMinutes
        : 0;
    const repeatPenalty = recent.includes(fingerprint) ? 1 : 0;
    const score = durationError * 4 + uturnCount * 1 + overlapRatio * 3 + repeatPenalty * 2;

    const exportWaypoints = sampleWaypoints(cleanedPath, Math.max(n, 6));
    const candidate: LoopResult & { score: number } = {
      route,
      waypoints: exportWaypoints.length >= 2 ? exportWaypoints : built.waypoints,
      durationMinutes,
      distanceKm,
      uturnCount,
      overlapRatio,
      fingerprint,
      qualityNotice: uturnCount > 0 || overlapRatio > 0.2,
      score,
    };

    if (!best || candidate.score < best.score) best = candidate;

    // Good enough — accept early and stop spending Routes API calls.
    if (durationError <= DURATION_TOLERANCE && uturnCount === 0 && repeatPenalty === 0) break;

    // Otherwise grow/shrink the radius proportionally toward the target duration.
    if (durationMinutes > 0) {
      const factor = Math.min(
        RADIUS_ADJUST_MAX,
        Math.max(RADIUS_ADJUST_MIN, input.durationMinutes / durationMinutes),
      );
      radiusKm *= factor;
    }
  }

  if (!best) throw new Error("No loop candidates");

  const { score: _score, ...result } = best;
  void _score;
  return result;
}
