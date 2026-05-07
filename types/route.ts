export type RouteCharacter = "city" | "mixed" | "highway" | "scenic";

export type LatLng = {
  lat: number;
  lng: number;
};

export type GeneratedRouteStats = {
  totalDistanceKm: number;
  totalDurationMinutes: number;
  waypointCount: number;
  avgSpeedKmh: number;
  durationErrorPct: number;
  uturnCount: number;
  overlapRatio: number;
  variationSeed: number;
};
