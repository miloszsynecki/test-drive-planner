import { describe, expect, it, vi } from "vitest";
import { flowThroughPoint, planLoop, removeBacktracks } from "@/lib/loopEngine";
import type { LatLng } from "@/types/route";

// Build a synthetic leg the way the engine consumes one: a `path` polyline plus a
// single `legs[0]` carrying distance/duration. The path is densified into several
// points along the straight line so flowThroughPoint has real interior vertices.
function fakeLeg(from: LatLng, to: LatLng, speedKmh = 40): unknown {
  const steps = 8;
  const path: LatLng[] = Array.from({ length: steps + 1 }, (_, i) => ({
    lat: from.lat + ((to.lat - from.lat) * i) / steps,
    lng: from.lng + ((to.lng - from.lng) * i) / steps,
  }));
  const dLat = (to.lat - from.lat) * 111_000;
  const dLng = (to.lng - from.lng) * 111_000 * Math.cos((from.lat * Math.PI) / 180);
  const distanceMeters = Math.hypot(dLat, dLng);
  const durationMillis = (distanceMeters / 1000 / speedKmh) * 3600 * 1000;
  return { path, legs: [{ distanceMeters, durationMillis }] };
}

const ORIGIN: LatLng = { lat: 52.2297, lng: 21.0122 };

function fixedRandom(value: number): () => number {
  return () => value;
}

describe("flowThroughPoint", () => {
  const ideal: LatLng = { lat: 1, lng: 1 };
  const path: LatLng[] = [
    { lat: 0, lng: 0 },
    { lat: 0.3, lng: 0.3 },
    { lat: 0.6, lng: 0.6 },
    { lat: 0.9, lng: 0.9 }, // closest to ideal, but it is the endpoint
  ];

  it("never returns the leg's endpoint (the potential dead-end snap)", () => {
    const chosen = flowThroughPoint(path, ideal);
    expect(chosen).not.toEqual(path[path.length - 1]);
  });

  it("returns an interior through-road point", () => {
    const chosen = flowThroughPoint(path, ideal);
    expect(chosen).toEqual(path[2]);
  });

  it("falls back to the last point for degenerate short paths", () => {
    expect(flowThroughPoint([{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }], ideal)).toEqual({ lat: 1, lng: 1 });
  });
});

describe("planLoop", () => {
  it("walks vertices in angular order and closes back to the origin", async () => {
    const calls: Array<[LatLng, LatLng]> = [];
    const computeLeg = vi.fn(async (from: LatLng, to: LatLng) => {
      calls.push([from, to]);
      return fakeLeg(from, to);
    });

    const result = await planLoop({
      origin: ORIGIN,
      durationMinutes: 20,
      loopSize: "standard",
      computeLeg,
      random: fixedRandom(0),
      maxAttempts: 1,
    });

    // 3 vertices (short tier) + 1 closing leg.
    expect(computeLeg).toHaveBeenCalledTimes(4);
    // The closing leg returns to the dealership.
    expect(calls[calls.length - 1][1]).toEqual(ORIGIN);
    // Each leg departs from where the previous one ended (no isolated jumps).
    for (let i = 1; i < calls.length; i += 1) {
      expect(calls[i][0]).toEqual(flowThroughPointOf(calls[i - 1]));
    }
    expect(result.waypoints.length).toBeGreaterThanOrEqual(2);
    expect(result.route.path.length).toBeGreaterThan(2);

    function flowThroughPointOf([from, to]: [LatLng, LatLng]): LatLng {
      return flowThroughPoint(
        (fakeLeg(from, to) as { path: LatLng[] }).path,
        to,
      );
    }
  });

  it("assembles a U-turn-free loop from clean straight legs", async () => {
    const computeLeg = async (from: LatLng, to: LatLng) => fakeLeg(from, to);
    const result = await planLoop({
      origin: ORIGIN,
      durationMinutes: 30,
      loopSize: "standard",
      computeLeg,
      random: fixedRandom(0.25),
      maxAttempts: 1,
    });
    expect(result.uturnCount).toBe(0);
  });

  it("shrinks the radius when the measured loop runs long", async () => {
    const radii: number[] = [];
    // Report a very fast speed so the first loop massively overshoots the target
    // duration, forcing a radius correction on the next attempt.
    const computeLeg = async (from: LatLng, to: LatLng) => {
      radii.push(Math.hypot(to.lat - from.lat, to.lng - from.lng));
      return fakeLeg(from, to, 200);
    };
    await planLoop({
      origin: ORIGIN,
      durationMinutes: 60,
      loopSize: "standard",
      computeLeg,
      random: fixedRandom(0),
      maxAttempts: 2,
    });
    // Second attempt's first leg should reach further (radius grew because the
    // 200km/h legs came back far too short on duration).
    const legsPerAttempt = radii.length / 2;
    expect(radii[legsPerAttempt]).toBeGreaterThan(radii[0]);
  });

  it("varies the rotation across regenerations via the RNG", async () => {
    const computeLeg = async (from: LatLng, to: LatLng) => fakeLeg(from, to);
    const first = await planLoop({
      origin: ORIGIN,
      durationMinutes: 20,
      loopSize: "standard",
      computeLeg,
      random: fixedRandom(0),
      maxAttempts: 1,
    });
    const second = await planLoop({
      origin: ORIGIN,
      durationMinutes: 20,
      loopSize: "standard",
      computeLeg,
      random: fixedRandom(0.5),
      maxAttempts: 1,
    });
    expect(first.fingerprint).not.toEqual(second.fingerprint);
  });
});

describe("removeBacktracks", () => {
  const E = 0.0012; // ~130m per step — comfortably more than one grid cell

  it("collapses a pure out-and-back spur", () => {
    const path: LatLng[] = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: E },
      { lat: 0, lng: 2 * E }, // tip
      { lat: 0, lng: E },
      { lat: 0, lng: 0 },
    ];
    const cleaned = removeBacktracks(path);
    expect(cleaned.length).toBeLessThan(path.length);
    expect(Math.max(...cleaned.map((p) => p.lng))).toBeLessThan(2 * E);
  });

  it("preserves a genuine loop that returns via different cells", () => {
    const loop: LatLng[] = [
      { lat: 0, lng: 0 },
      { lat: E, lng: 0 },
      { lat: E, lng: E },
      { lat: 0, lng: E },
      { lat: 0, lng: 0 },
    ];
    expect(removeBacktracks(loop)).toHaveLength(loop.length);
  });

  it("removes a spur hanging off a loop but keeps the loop", () => {
    const path: LatLng[] = [
      { lat: 0, lng: 0 },
      { lat: E, lng: 0 },
      { lat: E, lng: E },
      { lat: 0, lng: E }, // junction
      { lat: 0, lng: 2 * E }, // spur tip
      { lat: 0, lng: E }, // back to junction
      { lat: 0, lng: 0 },
    ];
    const cleaned = removeBacktracks(path);
    expect(cleaned).toHaveLength(5); // the four loop corners + closing point
    expect(Math.max(...cleaned.map((p) => p.lng))).toBeLessThan(2 * E);
  });
});
