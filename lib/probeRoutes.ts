import type { LatLng } from "@/types/route";
import { getPathFromRoute } from "@/lib/routeMetrics";

function targetPoint(origin: LatLng, angleDeg: number, radiusKm: number): LatLng {
  const angleRad = (angleDeg * Math.PI) / 180;
  const centerLatRad = (origin.lat * Math.PI) / 180;
  return {
    lat: origin.lat + (radiusKm / 111) * Math.cos(angleRad),
    lng: origin.lng + (radiusKm / (111 * Math.cos(centerLatRad))) * Math.sin(angleRad),
  };
}

function distanceSq(a: LatLng, b: LatLng): number {
  return (a.lat - b.lat) ** 2 + (a.lng - b.lng) ** 2;
}

function farthestPoint(origin: LatLng, path: LatLng[]): LatLng | null {
  if (path.length === 0) return null;
  let best = path[0];
  let bestDist = 0;
  for (const p of path) {
    const d = distanceSq(origin, p);
    if (d > bestDist) { bestDist = d; best = p; }
  }
  return best;
}

export function sortByAngle(origin: LatLng, waypoints: LatLng[]): LatLng[] {
  return [...waypoints].sort((a, b) => {
    const angleA = Math.atan2(a.lng - origin.lng, a.lat - origin.lat);
    const angleB = Math.atan2(b.lng - origin.lng, b.lat - origin.lat);
    return angleA - angleB;
  });
}

export async function probeRoadWaypoints(
  origin: LatLng,
  angleDegrees: number[],
  radiusKm: number,
  computeRoute: (waypoints: LatLng[]) => Promise<unknown>,
): Promise<LatLng[]> {
  const results: LatLng[] = [];
  for (const angleDeg of angleDegrees) {
    const target = targetPoint(origin, angleDeg, radiusKm);
    try {
      const route = await computeRoute([target]);
      const path = getPathFromRoute(route);
      const snapped = farthestPoint(origin, path) ?? target;
      results.push(snapped);
    } catch {
      results.push(target);
    }
  }
  return results;
}
