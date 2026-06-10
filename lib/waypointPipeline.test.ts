import { describe, expect, it } from "vitest";
import { runWaypointPipeline } from "@/lib/waypointPipeline";

describe("runWaypointPipeline", () => {
  it("drops points with non-finite coordinates", () => {
    const result = runWaypointPipeline([
      { lat: 0, lng: 0 },
      { lat: Number.NaN, lng: 1 },
      { lat: 0.02, lng: 0 },
    ]);
    expect(result.droppedInvalid).toBe(1);
    expect(result.waypoints).toHaveLength(2);
  });

  it("dedupes near-duplicate points within the threshold", () => {
    const result = runWaypointPipeline([
      { lat: 0, lng: 0 },
      { lat: 0.0005, lng: 0 }, // ~55m, under the 120m default
      { lat: 0.02, lng: 0 },
    ]);
    expect(result.droppedNearDuplicates).toBe(1);
    expect(result.waypoints).toHaveLength(2);
  });

  it("keeps well-spaced points without spacing warnings", () => {
    const result = runWaypointPipeline([
      { lat: 0, lng: 0 },
      { lat: 0.01, lng: 0 }, // ~1.1km
      { lat: 0.02, lng: 0 },
    ]);
    expect(result.waypoints).toHaveLength(3);
    expect(result.spacingWarnings).toBe(0);
  });

  it("flags spacing warnings for kept-but-too-close points", () => {
    const result = runWaypointPipeline([
      { lat: 0, lng: 0 },
      { lat: 0.0018, lng: 0 }, // ~200m: above dedupe (120m) but below min spacing (250m)
    ]);
    expect(result.waypoints).toHaveLength(2);
    expect(result.spacingWarnings).toBe(1);
  });

  it("normalizes longitude into [-180, 180]", () => {
    const result = runWaypointPipeline([{ lat: 0, lng: 200 }]);
    expect(result.waypoints[0].lng).toBeCloseTo(-160, 5);
  });
});
