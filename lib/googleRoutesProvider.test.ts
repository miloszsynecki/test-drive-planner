import { beforeAll, describe, expect, it, vi } from "vitest";
import { createGoogleRouteProvider, createRouteCache } from "@/lib/googleRoutesProvider";
import type { LatLng } from "@/types/route";

const FROM: LatLng = { lat: 0, lng: 0 };
const TO: LatLng = { lat: 0.01, lng: 0.01 };

beforeAll(() => {
  // computeRoutes reads google.maps.TravelMode at call time; stub the global.
  (globalThis as unknown as { google: unknown }).google = {
    maps: { TravelMode: { DRIVING: "DRIVING" } },
  };
});

function fakeLib() {
  const computeRoutes = vi.fn(async () => ({ routes: [{ path: [], legs: [] }] }));
  return { lib: { Route: { computeRoutes } }, computeRoutes };
}

describe("createGoogleRouteProvider caching", () => {
  it("serves identical legs from the cache", async () => {
    const { lib, computeRoutes } = fakeLib();
    const provider = createGoogleRouteProvider(lib, createRouteCache());

    await provider.computeLeg(FROM, TO);
    await provider.computeLeg(FROM, TO);

    expect(computeRoutes).toHaveBeenCalledTimes(1);
  });

  it("computes separately for different legs", async () => {
    const { lib, computeRoutes } = fakeLib();
    const provider = createGoogleRouteProvider(lib, createRouteCache());

    await provider.computeLeg(FROM, TO);
    await provider.computeLeg(FROM, { lat: 0.02, lng: 0.02 });

    expect(computeRoutes).toHaveBeenCalledTimes(2);
  });

  it("treats reversed legs as distinct", async () => {
    const { lib, computeRoutes } = fakeLib();
    const provider = createGoogleRouteProvider(lib, createRouteCache());

    await provider.computeLeg(FROM, TO);
    await provider.computeLeg(TO, FROM);

    expect(computeRoutes).toHaveBeenCalledTimes(2);
  });

  it("does not cache when no cache is provided", async () => {
    const { lib, computeRoutes } = fakeLib();
    const provider = createGoogleRouteProvider(lib);

    await provider.computeLeg(FROM, TO);
    await provider.computeLeg(FROM, TO);

    expect(computeRoutes).toHaveBeenCalledTimes(2);
  });
});
