import type { LatLng } from "@/types/route";

export type RouteFallbackLevel = "primary-stopover" | "sparse-stopover";

export type RoutePattern = {
  waypoints: LatLng[];
  stopover: boolean;
  fallbackLevel: RouteFallbackLevel;
};

export function createRoutePatterns(waypoints: LatLng[]): RoutePattern[] {
  const sparse = waypoints.filter((_, idx) => idx % 2 === 0);
  const sparseWaypoints = sparse.length >= 2 ? sparse : waypoints;
  return [
    { waypoints, stopover: true, fallbackLevel: "primary-stopover" },
    { waypoints: sparseWaypoints, stopover: true, fallbackLevel: "sparse-stopover" },
  ];
}
