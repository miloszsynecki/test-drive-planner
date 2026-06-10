import { createRoutePatterns, type RouteFallbackLevel } from "@/lib/fallbackRouting";
import { getAvgSpeed } from "@/lib/generateWaypoints";
import {
  getDeadEndProxy,
  getDurationMinutes,
  getOverlapRatio,
  getUTurnCount,
  makeFingerprint,
} from "@/lib/routeMetrics";
import { probeRoadWaypoints, sortByAngle } from "@/lib/probeRoutes";
import { runWaypointPipeline } from "@/lib/waypointPipeline";
import type { LatLng, LoopSize, RouteCharacter, WaypointDensity } from "@/types/route";

// "More waypoints" on the road-probe model means probing more angles around the
// dealership. Each probe point is snapped to a real road, so denser loops stay
// U-turn-free instead of cutting across the ellipse.
const DENSITY_PROBE_COUNT: Record<WaypointDensity, number> = {
  standard: 3,
  detailed: 5,
  max: 6,
};

// Bias for the randomized radius window. Compact loops stay near the
// dealership; wide loops roam further for the same target duration.
const LOOP_SIZE_BIAS: Record<LoopSize, number> = {
  compact: 0.82,
  standard: 1,
  wide: 1.22,
};

type PlannerConfig = {
  durationTolerancePrimary: number;
  durationToleranceFallback: number;
  maxProbeSets: {
    short: number;
    medium: number;
    long: number;
  };
  weights: {
    durationError: number;
    uturn: number;
    overlap: number;
    deadEnd: number;
    uniquenessPenalty: number;
  };
};

export const DEFAULT_PLANNER_CONFIG: PlannerConfig = {
  durationTolerancePrimary: 0.15,
  durationToleranceFallback: 0.25,
  maxProbeSets: {
    short: 4,
    medium: 5,
    long: 6,
  },
  weights: {
    durationError: 4.0,
    uturn: 0.8,
    overlap: 4.0,
    deadEnd: 1.2,
    uniquenessPenalty: 2.0,
  },
};

export type RouteCandidate = {
  route: unknown;
  generatedWaypoints: LatLng[];
  score: number;
  durationError: number;
  uturnCount: number;
  overlapRatio: number;
  radiusScale: number;
  waypointCount: number;
  angle: number;
  ellipseRatio: number;
  stopover: boolean;
  fallbackLevel: RouteFallbackLevel;
};

type PlanRouteInput = {
  origin: LatLng;
  durationMinutes: number;
  routeCharacter: RouteCharacter;
  config?: PlannerConfig;
  recentFingerprints: string[];
  loopSize?: LoopSize;
  waypointDensity?: WaypointDensity;
  computeRoute: (waypoints: LatLng[]) => Promise<unknown>;
  onProgress?: (message: string) => void;
};

type PlanRouteResult = {
  best: RouteCandidate;
  usedUTurnFallback: boolean;
  bestFingerprint: string;
};

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function getTier(durationMinutes: number): "short" | "medium" | "long" {
  if (durationMinutes <= 20) return "short";
  if (durationMinutes <= 45) return "medium";
  return "long";
}

function uniquenessPenalty(fingerprint: string, recentFingerprints: string[]): number {
  if (recentFingerprints.length === 0) return 0;
  return recentFingerprints.includes(fingerprint) ? 1 : 0;
}

export async function planRoute(input: PlanRouteInput): Promise<PlanRouteResult> {
  const config = input.config ?? DEFAULT_PLANNER_CONFIG;
  const tier = getTier(input.durationMinutes);
  const maxProbeSets = config.maxProbeSets[tier];
  const probeCount = DENSITY_PROBE_COUNT[input.waypointDensity ?? "standard"];
  const loopSizeBias = LOOP_SIZE_BIAS[input.loopSize ?? "standard"];

  const avgSpeed = getAvgSpeed(input.routeCharacter);
  const estimatedDistanceKm = (input.durationMinutes / 60) * avgSpeed;
  const baseRadiusKm = estimatedDistanceKm / (2 * Math.PI);

  const candidates: RouteCandidate[] = [];

  for (let i = 0; i < maxProbeSets; i += 1) {
    if (i === 0) input.onProgress?.("Probing road network...");
    if (i === Math.floor(maxProbeSets / 2)) input.onProgress?.("Evaluating alternatives...");
    if (i === maxProbeSets - 1) input.onProgress?.("Finalizing best match...");

    // Each probe set starts at a random angle so repeated Generate Route clicks
    // explore different parts of the road network around the dealership.
    const angleStep = 360 / probeCount;
    const startAngle = randomBetween(0, angleStep);
    const radiusScale = randomBetween(0.8, 1.2) * loopSizeBias;
    const radiusKm = baseRadiusKm * radiusScale;
    const probeAngles = Array.from({ length: probeCount }, (_, k) => startAngle + k * angleStep);

    const roadWaypoints = await probeRoadWaypoints(
      input.origin,
      probeAngles,
      radiusKm,
      input.computeRoute,
    );

    // Sort road-anchored points clockwise by angle so the route sweeps around
    // the dealership without crossing itself.
    const sorted = sortByAngle(input.origin, roadWaypoints);
    const pipeline = runWaypointPipeline(sorted);
    if (pipeline.waypoints.length < 2) continue;

    const patterns = createRoutePatterns(pipeline.waypoints);
    for (const pattern of patterns) {
      try {
        const result = await input.computeRoute(pattern.waypoints);
        const durationError =
          Math.abs(getDurationMinutes(result) - input.durationMinutes) / input.durationMinutes;
        const uturnCount = getUTurnCount(result);
        const overlapRatio = getOverlapRatio(result);
        const deadEndCount = getDeadEndProxy(result);
        const fingerprint = makeFingerprint(result);
        const uniquePenalty = uniquenessPenalty(fingerprint, input.recentFingerprints);

        const score =
          durationError * config.weights.durationError +
          uturnCount * config.weights.uturn +
          overlapRatio * config.weights.overlap +
          deadEndCount * config.weights.deadEnd +
          uniquePenalty * config.weights.uniquenessPenalty;

        candidates.push({
          route: result,
          generatedWaypoints: pattern.waypoints,
          score,
          durationError,
          uturnCount,
          overlapRatio,
          radiusScale,
          waypointCount: pattern.waypoints.length,
          angle: startAngle,
          ellipseRatio: 1,
          stopover: pattern.stopover,
          fallbackLevel: pattern.fallbackLevel,
        });

        if (
          durationError <= config.durationTolerancePrimary &&
          uturnCount === 0 &&
          overlapRatio <= 0.12 &&
          deadEndCount <= 1 &&
          uniquePenalty === 0
        ) {
          i = maxProbeSets;
          break;
        }
      } catch {
        // Continue with next pattern.
      }
    }
  }

  if (candidates.length === 0) {
    throw new Error("No route candidates");
  }

  const inPrimaryBand = candidates.filter(
    (candidate) => candidate.durationError <= config.durationTolerancePrimary,
  );
  const inFallbackBand = candidates.filter(
    (candidate) => candidate.durationError <= config.durationToleranceFallback,
  );
  const basePool =
    inPrimaryBand.length > 0
      ? inPrimaryBand
      : inFallbackBand.length > 0
        ? inFallbackBand
        : candidates;
  const noUTurn = basePool.filter((candidate) => candidate.uturnCount === 0);
  const lowOverlapNoUTurn = noUTurn.filter((candidate) => candidate.overlapRatio <= 0.18);
  const usedUTurnFallback = noUTurn.length === 0;
  const pool = usedUTurnFallback
    ? basePool
    : lowOverlapNoUTurn.length > 0
      ? lowOverlapNoUTurn
      : noUTurn;
  pool.sort((a, b) => a.score - b.score);
  const best = pool[0];
  const bestFingerprint = makeFingerprint(best.route);

  return {
    best,
    usedUTurnFallback,
    bestFingerprint,
  };
}
