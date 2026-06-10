import { describe, expect, it } from "vitest";
import { generateWaypoints, getAvgSpeed } from "@/lib/generateWaypoints";
import type { LatLng } from "@/types/route";

const CENTER: LatLng = { lat: 52.2297, lng: 21.0122 };

// Mirror the planar approximation generateWaypoints uses, so radius assertions
// are deterministic rather than dependent on a full haversine.
function planarDistanceKm(center: LatLng, point: LatLng): number {
  const latKm = (point.lat - center.lat) * 111;
  const lngKm = (point.lng - center.lng) * 111 * Math.cos((center.lat * Math.PI) / 180);
  return Math.hypot(latKm, lngKm);
}

describe("getAvgSpeed", () => {
  it("maps each route character to its speed", () => {
    expect(getAvgSpeed("city")).toBe(30);
    expect(getAvgSpeed("mixed")).toBe(40);
    expect(getAvgSpeed("highway")).toBe(70);
    expect(getAvgSpeed("scenic")).toBe(35);
  });
});

describe("generateWaypoints", () => {
  it("defaults to three points and honors the count override", () => {
    expect(generateWaypoints(CENTER, 30, "mixed").length).toBe(3);
    expect(generateWaypoints(CENTER, 30, "mixed", 1, 6).length).toBe(6);
  });

  it("places waypoints on a circle of the expected radius", () => {
    const durationMinutes = 60;
    const points = generateWaypoints(CENTER, durationMinutes, "mixed", 1, 8, 22.5, 1);
    const expectedRadiusKm = ((durationMinutes / 60) * getAvgSpeed("mixed")) / (2 * Math.PI);
    for (const point of points) {
      expect(planarDistanceKm(CENTER, point)).toBeCloseTo(expectedRadiusKm, 4);
    }
  });

  it("scales the radius with radiusScale", () => {
    const small = generateWaypoints(CENTER, 60, "mixed", 0.5, 8, 0, 1);
    const large = generateWaypoints(CENTER, 60, "mixed", 1.5, 8, 0, 1);
    expect(planarDistanceKm(CENTER, large[0])).toBeGreaterThan(planarDistanceKm(CENTER, small[0]));
  });
});
