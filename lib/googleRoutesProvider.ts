import type { LatLng } from "@/types/route";

type GoogleRoutesLibrary = {
  Route: {
    computeRoutes: (request: unknown) => Promise<{ routes?: unknown[] }>;
  };
};

type RouteProvider = {
  computeRoute: (waypoints: LatLng[]) => Promise<unknown>;
};

export function createGoogleRouteProvider(
  routesLib: GoogleRoutesLibrary,
  origin: LatLng,
): RouteProvider {
  return {
    computeRoute: async (waypoints: LatLng[]): Promise<unknown> => {
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
    },
  };
}
