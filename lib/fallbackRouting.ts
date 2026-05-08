import type { LatLng } from "@/types/route";

export type RouteFallbackLevel = "strict-via" | "sparse-via" | "sparse-stopover";

export type RoutePattern = {
  waypoints: LatLng[];
  stopover: boolean;
  fallbackLevel: RouteFallbackLevel;
};

export function createRoutePatterns(waypoints: LatLng[]): RoutePattern[] {
  const sparse = waypoints.filter((_, idx) => idx % 2 === 0);
  return [
    {
      waypoints,
      stopover: false,
      fallbackLevel: "strict-via",
    },
    {
      waypoints: sparse,
      stopover: false,
      fallbackLevel: "sparse-via",
    },
    {
      waypoints: sparse,
      stopover: true,
      fallbackLevel: "sparse-stopover",
    },
  ];
}
