import type { LatLng, RouteCharacter } from "@/types/route";

const AVG_SPEEDS: Record<RouteCharacter, number> = {
  city: 30,
  mixed: 40,
  highway: 70,
  scenic: 35,
};

export function getAvgSpeed(routeCharacter: RouteCharacter): number {
  return AVG_SPEEDS[routeCharacter];
}

export function generateWaypoints(
  center: LatLng,
  durationMinutes: number,
  routeCharacter: RouteCharacter,
  radiusScale = 1,
  waypointCountOverride?: number,
  startAngleDegOverride?: number,
  ellipseRatio = 1,
): LatLng[] {
  const avgSpeed = getAvgSpeed(routeCharacter);
  const estimatedDistanceKm = (durationMinutes / 60) * avgSpeed;
  const radiusKm = (estimatedDistanceKm / (2 * Math.PI)) * radiusScale;
  const centerLatRad = (center.lat * Math.PI) / 180;
  const waypointCount =
    waypointCountOverride ?? (durationMinutes <= 20 ? 6 : durationMinutes <= 45 ? 8 : 10);
  const startAngleDeg = startAngleDegOverride ?? 22.5;
  const angleStepDeg = 360 / waypointCount;
  const angles = Array.from(
    { length: waypointCount },
    (_, i) => startAngleDeg + i * angleStepDeg,
  );

  return angles.map((angle) => {
    const angleRad = (angle * Math.PI) / 180;
    const lat = center.lat + ((radiusKm * ellipseRatio) / 111) * Math.cos(angleRad);
    const lng =
      center.lng +
      (radiusKm / (111 * Math.cos(centerLatRad))) * Math.sin(angleRad);

    return { lat, lng };
  });
}
