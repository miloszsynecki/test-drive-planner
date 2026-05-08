import type { LatLng } from "@/types/route";

type RouteStep = {
  navigationInstruction?: {
    instructions?: string;
  };
};

type RouteLeg = {
  distanceMeters?: number;
  durationMillis?: number;
  steps?: RouteStep[];
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

export function getUTurnCount(route: unknown): number {
  const steps = getLegs(route).flatMap((leg) => leg.steps ?? []);
  return steps.filter((step) => {
    const rawInstruction = (step.navigationInstruction?.instructions ?? "").toLowerCase();
    const instruction = rawInstruction
      .replace(/<[^>]*>/g, " ")
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    return /(?:^|\s)u\s*-?\s*turn(?:\s|$)|(?:^|\s)uturn(?:\s|$)|turn around/.test(instruction);
  }).length;
}

export function getOverlapRatio(route: unknown): number {
  const path = getPathFromRoute(route);
  const visited = new Set<string>();
  let repeated = 0;
  for (const p of path) {
    const key = `${p.lat.toFixed(4)}:${p.lng.toFixed(4)}`;
    if (visited.has(key)) repeated += 1;
    visited.add(key);
  }
  return path.length > 0 ? repeated / path.length : 0;
}

export function getDeadEndProxy(route: unknown): number {
  const steps = getLegs(route).flatMap((leg) => leg.steps ?? []);
  let count = 0;
  for (let i = 1; i < steps.length; i += 1) {
    const prev = steps[i - 1];
    const curr = steps[i];
    const prevInstruction = (prev.navigationInstruction?.instructions ?? "").toLowerCase();
    const currInstruction = (curr.navigationInstruction?.instructions ?? "").toLowerCase();
    const shortOutAndBack = prevInstruction.includes("turn") && currInstruction.includes("turn");
    if (shortOutAndBack) count += 1;
  }
  return count;
}

export function makeFingerprint(route: unknown): string {
  const path = getPathFromRoute(route);
  return path
    .filter((_, idx) => idx % 4 === 0)
    .map((p) => `${p.lat.toFixed(3)}:${p.lng.toFixed(3)}`)
    .join("|");
}
