import { describe, expect, it } from "vitest";
import {
  getDurationMinutes,
  getOverlapRatio,
  getPathFromRoute,
  getUTurnCount,
} from "@/lib/routeMetrics";
import type { LatLng } from "@/types/route";

function routeFromPath(path: LatLng[]): unknown {
  return { path };
}

describe("getPathFromRoute", () => {
  it("reads plain-number coordinates", () => {
    const path = getPathFromRoute({ path: [{ lat: 1, lng: 2 }] });
    expect(path).toEqual([{ lat: 1, lng: 2 }]);
  });

  it("reads function-style coordinates (LatLng objects)", () => {
    const path = getPathFromRoute({ path: [{ lat: () => 1, lng: () => 2 }] });
    expect(path).toEqual([{ lat: 1, lng: 2 }]);
  });
});

describe("getDurationMinutes", () => {
  it("sums leg durations and converts to minutes", () => {
    const route = { legs: [{ durationMillis: 60_000 }, { durationMillis: 120_000 }] };
    expect(getDurationMinutes(route)).toBe(3);
  });
});

describe("getUTurnCount", () => {
  it("returns 0 for a smooth right-angled loop", () => {
    const loop = routeFromPath([
      { lat: 0, lng: 0 },
      { lat: 0.002, lng: 0 },
      { lat: 0.002, lng: 0.002 },
      { lat: 0, lng: 0.002 },
      { lat: 0, lng: 0 },
    ]);
    expect(getUTurnCount(loop)).toBe(0);
  });

  it("detects a heading reversal as a U-turn", () => {
    const outAndBack = routeFromPath([
      { lat: 0, lng: 0 },
      { lat: 0.001, lng: 0 },
      { lat: 0.002, lng: 0 },
      { lat: 0.001, lng: 0 },
      { lat: 0, lng: 0 },
    ]);
    expect(getUTurnCount(outAndBack)).toBeGreaterThanOrEqual(1);
  });
});

describe("getOverlapRatio", () => {
  it("returns 0 for fewer than two points", () => {
    expect(getOverlapRatio(routeFromPath([{ lat: 0, lng: 0 }]))).toBe(0);
  });

  it("returns 0 for a straight path that never revisits", () => {
    const straight = routeFromPath([
      { lat: 0, lng: 0 },
      { lat: 0, lng: 0.001 },
      { lat: 0, lng: 0.002 },
      { lat: 0, lng: 0.003 },
    ]);
    expect(getOverlapRatio(straight)).toBe(0);
  });

  it("reports overlap when the route retraces itself", () => {
    const retrace = routeFromPath([
      { lat: 0, lng: 0 },
      { lat: 0, lng: 0.001 },
      { lat: 0, lng: 0.002 },
      { lat: 0, lng: 0.003 },
      { lat: 0, lng: 0.002 },
      { lat: 0, lng: 0.001 },
      { lat: 0, lng: 0 },
    ]);
    expect(getOverlapRatio(retrace)).toBeGreaterThan(0);
  });
});
