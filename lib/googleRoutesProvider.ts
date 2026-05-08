import type { LatLng } from "@/types/route";

type GoogleRoutesLibrary = {
  Route: {
    computeRoutes: (request: unknown) => Promise<{ routes?: unknown[] }>;
  };
};

type RouteProvider = {
  computeRoute: (waypoints: LatLng[], stopover: boolean) => Promise<unknown>;
};

export function createGoogleRouteProvider(
  routesLib: GoogleRoutesLibrary,
  origin: LatLng,
): RouteProvider {
  return {
    computeRoute: async (waypoints: LatLng[], stopover: boolean): Promise<unknown> => {
      const requestBase = {
        origin,
        destination: origin,
        travelMode: google.maps.TravelMode.DRIVING,
        intermediates: waypoints.map((point) => ({ location: point, via: !stopover })),
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
    },
  };
}
