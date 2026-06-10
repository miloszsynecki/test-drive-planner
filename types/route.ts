export type RouteCharacter = "city" | "mixed" | "highway" | "scenic";

export type LoopSize = "compact" | "standard" | "wide";

export type WaypointDensity = "standard" | "detailed" | "max";

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
  fallbackLevel: "primary-stopover" | "sparse-stopover";
  usedUTurnFallback: boolean;
};
