import { beforeAll, describe, expect, it, vi } from "vitest";
import { createGoogleRouteProvider, createRouteCache } from "@/lib/googleRoutesProvider";
import type { LatLng } from "@/types/route";

const ORIGIN: LatLng = { lat: 0, lng: 0 };

beforeAll(() => {
  // computeRoutes reads google.maps.TravelMode at call time; stub the global.
  (globalThis as unknown as { google: unknown }).google = {
    maps: { TravelMode: { DRIVING: "DRIVING" } },
  };
});

function fakeLib() {
  const computeRoutes = vi.fn(async () => ({ routes: [{ path: [] }] }));
  return { lib: { Route: { computeRoutes } }, computeRoutes };
}

describe("createGoogleRouteProvider caching", () => {
  it("serves identical requests from the cache", async () => {
    const { lib, computeRoutes } = fakeLib();
    const provider = createGoogleRouteProvider(lib, ORIGIN, createRouteCache());
    const waypoints: LatLng[] = [{ lat: 0.01, lng: 0.01 }];

    await provider.computeRoute(waypoints);
    await provider.computeRoute(waypoints);

    expect(computeRoutes).toHaveBeenCalledTimes(1);
  });

  it("computes separately for different waypoint sets", async () => {
    const { lib, computeRoutes } = fakeLib();
    const provider = createGoogleRouteProvider(lib, ORIGIN, createRouteCache());

    await provider.computeRoute([{ lat: 0.01, lng: 0.01 }]);
    await provider.computeRoute([{ lat: 0.02, lng: 0.02 }]);

    expect(computeRoutes).toHaveBeenCalledTimes(2);
  });

  it("does not cache when no cache is provided", async () => {
    const { lib, computeRoutes } = fakeLib();
    const provider = createGoogleRouteProvider(lib, ORIGIN);
    const waypoints: LatLng[] = [{ lat: 0.01, lng: 0.01 }];

    await provider.computeRoute(waypoints);
    await provider.computeRoute(waypoints);

    expect(computeRoutes).toHaveBeenCalledTimes(2);
  });
});
