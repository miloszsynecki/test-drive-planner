import { describe, expect, it } from "vitest";
import { buildExportUrls } from "@/lib/buildExportUrls";
import type { LatLng } from "@/types/route";

const POINTS: LatLng[] = [
  { lat: 1, lng: 1 },
  { lat: 2, lng: 2 },
  { lat: 3, lng: 3 },
];

describe("buildExportUrls", () => {
  it("encodes the dealership address as origin and destination", () => {
    const { googleMapsUrl } = buildExportUrls("1 Dealer St", { lat: 0, lng: 0 }, POINTS);
    const params = new URL(googleMapsUrl).searchParams;
    expect(params.get("origin")).toBe("1 Dealer St");
    expect(params.get("destination")).toBe("1 Dealer St");
    expect(params.get("travelmode")).toBe("driving");
  });

  it("includes every waypoint in the Google Maps link", () => {
    const { googleMapsUrl } = buildExportUrls("1 Dealer St", { lat: 0, lng: 0 }, POINTS);
    const waypointsParam = new URL(googleMapsUrl).searchParams.get("waypoints");
    expect(waypointsParam).not.toBeNull();
    expect(waypointsParam!.split("|")).toHaveLength(POINTS.length);
  });

  it("builds a Waze link pointing at the dealership", () => {
    const { wazeUrl } = buildExportUrls("1 Dealer St", { lat: 52.1, lng: 21.2 }, POINTS);
    expect(wazeUrl).toContain("52.1,21.2");
    expect(wazeUrl).toContain("navigate=yes");
  });
});
