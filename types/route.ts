export type LoopSize = "compact" | "standard" | "wide";

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
  qualityNotice: boolean;
};
