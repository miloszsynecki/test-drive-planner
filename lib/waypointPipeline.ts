import type { LatLng } from "@/types/route";

type WaypointPipelineOptions = {
  dedupeThresholdMeters?: number;
  minWaypointSpacingMeters?: number;
  maxWaypointSpacingMeters?: number;
};

type WaypointPipelineResult = {
  waypoints: LatLng[];
  droppedInvalid: number;
  droppedNearDuplicates: number;
  spacingWarnings: number;
};

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineDistanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

function normalizePoint(point: LatLng): LatLng | null {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
  const lat = Math.min(90, Math.max(-90, point.lat));
  const lng = ((((point.lng + 180) % 360) + 360) % 360) - 180;
  return { lat, lng };
}

export function runWaypointPipeline(
  rawWaypoints: LatLng[],
  options: WaypointPipelineOptions = {},
): WaypointPipelineResult {
  const dedupeThreshold = options.dedupeThresholdMeters ?? 120;
  const minSpacing = options.minWaypointSpacingMeters ?? 250;
  const maxSpacing = options.maxWaypointSpacingMeters ?? 12_000;

  let droppedInvalid = 0;
  let droppedNearDuplicates = 0;
  let spacingWarnings = 0;

  const normalized = rawWaypoints
    .map((point) => {
      const normalizedPoint = normalizePoint(point);
      if (!normalizedPoint) droppedInvalid += 1;
      return normalizedPoint;
    })
    .filter((point): point is LatLng => Boolean(point));

  const deduped: LatLng[] = [];
  for (const point of normalized) {
    const hasNeighbor = deduped.some(
      (existing) => haversineDistanceMeters(existing, point) < dedupeThreshold,
    );
    if (hasNeighbor) {
      droppedNearDuplicates += 1;
      continue;
    }
    deduped.push(point);
  }

  if (deduped.length > 1) {
    for (let i = 1; i < deduped.length; i += 1) {
      const distance = haversineDistanceMeters(deduped[i - 1], deduped[i]);
      if (distance < minSpacing || distance > maxSpacing) spacingWarnings += 1;
    }
  }

  return {
    waypoints: deduped,
    droppedInvalid,
    droppedNearDuplicates,
    spacingWarnings,
  };
}
