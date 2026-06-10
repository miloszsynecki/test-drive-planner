import type { LatLng } from "@/types/route";

type GoogleRoutesLibrary = {
  Route: {
    computeRoutes: (request: unknown) => Promise<{ routes?: unknown[] }>;
  };
};

type RouteProvider = {
  computeRoute: (waypoints: LatLng[]) => Promise<unknown>;
};

// A session-scoped cache of computeRoutes results. The planner probes the road
// network and evaluates many candidate patterns, and regenerating reuses the
// same origin — keying by origin + waypoints lets identical billed calls be
// served from memory instead of re-charging the Routes API.
export type RouteCache = Map<string, Promise<unknown>>;

export function createRouteCache(): RouteCache {
  return new Map();
}

function round(value: number): string {
  // ~1m precision: enough to dedupe identical requests without collapsing
  // genuinely distinct waypoint sets.
  return value.toFixed(5);
}

function cacheKey(origin: LatLng, waypoints: LatLng[]): string {
  const points = waypoints.map((p) => `${round(p.lat)},${round(p.lng)}`).join("|");
  return `${round(origin.lat)},${round(origin.lng)}#${points}`;
}

export function createGoogleRouteProvider(
  routesLib: GoogleRoutesLibrary,
  origin: LatLng,
  cache?: RouteCache,
): RouteProvider {
  const computeUncached = async (waypoints: LatLng[]): Promise<unknown> => {
    const requestBase = {
      origin,
      destination: origin,
      travelMode: google.maps.TravelMode.DRIVING,
      intermediates: waypoints.map((point) => ({ location: point, via: false })),
    };

    try {
      const detailed = await routesLib.Route.computeRoutes({
        ...requestBase,
        fields: ["path", "legs", "legs.steps", "legs.steps.navigationInstruction"],
      });
      const route = detailed.routes?.[0];
      if (!route) throw new Error("No route");
      return route;
    } catch {
      const basic = await routesLib.Route.computeRoutes({
        ...requestBase,
        fields: ["path", "legs"],
      });
      const route = basic.routes?.[0];
      if (!route) throw new Error("No route");
      return route;
    }
  };

  return {
    computeRoute: (waypoints: LatLng[]): Promise<unknown> => {
      if (!cache) return computeUncached(waypoints);

      const key = cacheKey(origin, waypoints);
      const cached = cache.get(key);
      if (cached) return cached;

      const pending = computeUncached(waypoints);
      cache.set(key, pending);
      // Don't cache failures — a transient error shouldn't poison later retries.
      pending.catch(() => cache.delete(key));
      return pending;
    },
  };
}
