import type { LatLng } from "@/types/route";

type GoogleRoutesLibrary = {
  Route: {
    computeRoutes: (request: unknown) => Promise<{ routes?: unknown[] }>;
  };
};

export type LegProvider = {
  computeLeg: (from: LatLng, to: LatLng) => Promise<unknown>;
};

// A session-scoped cache of computeRoutes results. The loop engine walks the
// road network one leg at a time and may re-probe the same anchor when refining
// the loop length or regenerating — keying by from + to lets identical billed
// calls be served from memory instead of re-charging the Routes API.
export type RouteCache = Map<string, Promise<unknown>>;

export function createRouteCache(): RouteCache {
  return new Map();
}

function round(value: number): string {
  // ~1m precision: enough to dedupe identical requests without collapsing
  // genuinely distinct points.
  return value.toFixed(5);
}

function cacheKey(from: LatLng, to: LatLng): string {
  return `${round(from.lat)},${round(from.lng)}>${round(to.lat)},${round(to.lng)}`;
}

export function createGoogleRouteProvider(
  routesLib: GoogleRoutesLibrary,
  cache?: RouteCache,
): LegProvider {
  const computeUncached = async (from: LatLng, to: LatLng): Promise<unknown> => {
    const result = await routesLib.Route.computeRoutes({
      origin: from,
      destination: to,
      travelMode: google.maps.TravelMode.DRIVING,
      fields: ["path", "legs"],
    });
    const route = result.routes?.[0];
    if (!route) throw new Error("No route");
    return route;
  };

  return {
    computeLeg: (from: LatLng, to: LatLng): Promise<unknown> => {
      if (!cache) return computeUncached(from, to);

      const key = cacheKey(from, to);
      const cached = cache.get(key);
      if (cached) return cached;

      const pending = computeUncached(from, to);
      cache.set(key, pending);
      // Don't cache failures — a transient error shouldn't poison later retries.
      pending.catch(() => cache.delete(key));
      return pending;
    },
  };
}
