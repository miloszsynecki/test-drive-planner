import { createRoutePatterns, type RouteFallbackLevel } from "@/lib/fallbackRouting";
import { generateWaypoints } from "@/lib/generateWaypoints";
import {
  getDeadEndProxy,
  getDurationMinutes,
  getOverlapRatio,
  getUTurnCount,
  makeFingerprint,
} from "@/lib/routeMetrics";
import { runWaypointPipeline } from "@/lib/waypointPipeline";
import type { LatLng, RouteCharacter } from "@/types/route";

type PlannerConfig = {
  durationTolerancePrimary: number;
  durationToleranceFallback: number;
  maxCandidates: {
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
  durationToleranceFallback: 0.2,
  maxCandidates: {
    short: 6,
    medium: 8,
    long: 10,
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
  const maxCandidates = config.maxCandidates[tier];
  const baseWaypointCount = 3;

  const candidates: RouteCandidate[] = [];

  for (let i = 0; i < maxCandidates; i += 1) {
    if (i === 0) input.onProgress?.("Building route candidates...");
    if (i === Math.floor(maxCandidates / 3)) input.onProgress?.("Evaluating alternatives...");
    if (i === Math.floor((2 * maxCandidates) / 3)) input.onProgress?.("Finalizing best match...");
    const waypointCount = Math.max(4, baseWaypointCount + Math.round(randomBetween(-2, 2)));
    const radiusScale = randomBetween(0.72, 1.26);
    const angle = randomBetween(0, 360);
    const ellipseRatio = randomBetween(0.82, 1.18);
    const generatedWaypoints = generateWaypoints(
      input.origin,
      input.durationMinutes,
      input.routeCharacter,
      radiusScale,
      waypointCount,
      angle,
      ellipseRatio,
    );
    const waypointPipeline = runWaypointPipeline(generatedWaypoints);
    if (waypointPipeline.waypoints.length < 3) continue;

    const patterns = createRoutePatterns(waypointPipeline.waypoints);
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
          waypointCount,
          angle,
          ellipseRatio,
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
          i = maxCandidates;
          break;
        }
      } catch {
        // Continue with next candidate.
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
