"use client";

import { useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { APIProvider } from "@vis.gl/react-google-maps";
import { ExportButtons } from "@/components/ExportButtons";
import { RouteForm } from "@/components/RouteForm";
import { RouteStats } from "@/components/RouteStats";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { buildExportUrls } from "@/lib/buildExportUrls";
import { generateWaypoints, getAvgSpeed } from "@/lib/generateWaypoints";
import type { GeneratedRouteStats, LatLng, RouteCharacter } from "@/types/route";

const RouteMap = dynamic(
  () => import("@/components/RouteMap").then((m) => m.RouteMap),
  { ssr: false },
);

type PlannerConfig = {
  durationTolerancePrimary: number;
  durationToleranceFallback: number;
  maxCandidates: {
    short: number;
    medium: number;
    long: number;
  };
  weights: {
    durationError: number;
    uturn: number;
    overlap: number;
    deadEnd: number;
    uniquenessPenalty: number;
  };
};

const PLANNER_CONFIG: PlannerConfig = {
  durationTolerancePrimary: 0.15,
  durationToleranceFallback: 0.2,
  maxCandidates: {
    short: 18,
    medium: 24,
    long: 30,
  },
  weights: {
    durationError: 3.2,
    uturn: 1.6,
    overlap: 4.0,
    deadEnd: 1.2,
    uniquenessPenalty: 2.0,
  },
};

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function getTier(durationMinutes: number): "short" | "medium" | "long" {
  if (durationMinutes <= 20) return "short";
  if (durationMinutes <= 45) return "medium";
  return "long";
}

export default function Page() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [loading, setLoading] = useState(false);
  const [routePath, setRoutePath] = useState<LatLng[]>([]);
  const [dealershipAddress, setDealershipAddress] = useState("");
  const [dealershipLatLng, setDealershipLatLng] = useState<LatLng | null>(null);
  const [waypoints, setWaypoints] = useState<LatLng[]>([]);
  const [stats, setStats] = useState<GeneratedRouteStats | null>(null);
  const [routeError, setRouteError] = useState("");
  const recentFingerprintsRef = useRef<string[]>([]);

  const exports = useMemo(() => {
    if (!dealershipLatLng || !dealershipAddress || waypoints.length === 0) return null;
    return buildExportUrls(dealershipAddress, dealershipLatLng, waypoints);
  }, [dealershipAddress, dealershipLatLng, waypoints]);

  const resolveWithPlaces = async (address: string): Promise<LatLng | null> => {
    const places = window.google.maps.places as unknown as {
      AutocompleteSuggestion?: {
        fetchAutocompleteSuggestions: (
          request: unknown,
        ) => Promise<{ suggestions?: Array<{ placePrediction?: { toPlace?: () => { fetchFields?: (input: unknown) => Promise<void>; location?: { lat: () => number; lng: () => number } } } }> }>;
      };
      AutocompleteSessionToken?: new () => google.maps.places.AutocompleteSessionToken;
    };

    if (!places.AutocompleteSuggestion) return null;

    try {
      const token = places.AutocompleteSessionToken ? new places.AutocompleteSessionToken() : undefined;
      const response = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: address,
        sessionToken: token,
      });
      const firstPrediction = response.suggestions?.[0]?.placePrediction;
      const place = firstPrediction?.toPlace?.();
      if (!place?.fetchFields) return null;
      await place.fetchFields({ fields: ["location"] });
      if (!place.location) return null;
      return { lat: place.location.lat(), lng: place.location.lng() };
    } catch {
      return null;
    }
  };

  const getPathFromRoute = (route: unknown): LatLng[] => {
    const rawPath = (route as { path?: Array<{ lat?: number | (() => number); lng?: number | (() => number) }> }).path ?? [];
    return rawPath
      .map((point) => {
        const lat = typeof point.lat === "function" ? point.lat() : point.lat;
        const lng = typeof point.lng === "function" ? point.lng() : point.lng;
        if (typeof lat !== "number" || typeof lng !== "number") return null;
        return { lat, lng };
      })
      .filter((p): p is LatLng => Boolean(p));
  };

  const getLegs = (route: unknown): Array<{ distanceMeters?: number; durationMillis?: number; steps?: Array<{ navigationInstruction?: { instructions?: string } }> }> =>
    ((route as { legs?: Array<{ distanceMeters?: number; durationMillis?: number; steps?: Array<{ navigationInstruction?: { instructions?: string } }> }> }).legs ?? []);

  const getDurationMinutes = (route: unknown): number => {
    const totalMillis = getLegs(route).reduce((sum, leg) => sum + Number(leg.durationMillis ?? 0), 0);
    return totalMillis / 1000 / 60;
  };

  const getUTurnCount = (route: unknown): number => {
    const steps = getLegs(route).flatMap((leg) => leg.steps ?? []);
    return steps.filter((step) =>
      (step.navigationInstruction?.instructions ?? "").toLowerCase().includes("u-turn"),
    ).length;
  };

  const getOverlapRatio = (route: unknown): number => {
    const path = getPathFromRoute(route);
    const visited = new Set<string>();
    let repeated = 0;
    for (const p of path) {
      const key = `${p.lat.toFixed(4)}:${p.lng.toFixed(4)}`;
      if (visited.has(key)) repeated += 1;
      visited.add(key);
    }
    return path.length > 0 ? repeated / path.length : 0;
  };

  const getDeadEndProxy = (route: unknown): number => {
    const steps = getLegs(route).flatMap((leg) => leg.steps ?? []);
    let count = 0;
    for (let i = 1; i < steps.length; i += 1) {
      const prev = steps[i - 1];
      const curr = steps[i];
      const prevInstruction = (prev.navigationInstruction?.instructions ?? "").toLowerCase();
      const currInstruction = (curr.navigationInstruction?.instructions ?? "").toLowerCase();
      const shortOutAndBack =
        prevInstruction.includes("turn") &&
        currInstruction.includes("turn");
      if (shortOutAndBack) count += 1;
    }
    return count;
  };

  const makeFingerprint = (route: unknown): string => {
    const path = getPathFromRoute(route);
    return path
      .filter((_, idx) => idx % 4 === 0)
      .map((p) => `${p.lat.toFixed(3)}:${p.lng.toFixed(3)}`)
      .join("|");
  };

  const uniquenessPenalty = (fingerprint: string): number => {
    if (recentFingerprintsRef.current.length === 0) return 0;
    const exact = recentFingerprintsRef.current.includes(fingerprint);
    return exact ? 1 : 0;
  };

  const calculateStats = (
    route: unknown,
    avgSpeedKmh: number,
    requestedMinutes: number,
    variationSeed: number,
  ): GeneratedRouteStats => {
    const legs = getLegs(route);
    const totalMeters = legs.reduce((sum, leg) => sum + Number(leg.distanceMeters ?? 0), 0);
    const totalDurationMinutes = getDurationMinutes(route);

    return {
      totalDistanceKm: totalMeters / 1000,
      totalDurationMinutes,
      waypointCount: legs.length,
      avgSpeedKmh,
      durationErrorPct: (Math.abs(totalDurationMinutes - requestedMinutes) / requestedMinutes) * 100,
      uturnCount: getUTurnCount(route),
      overlapRatio: getOverlapRatio(route),
      variationSeed,
    };
  };

  const generateRoute = async (input: {
    address: string;
    latLng: LatLng | null;
    durationMinutes: number;
    routeCharacter: RouteCharacter;
  }) => {
    setLoading(true);
    setRouteError("");

    try {
      if (!window.google?.maps) throw new Error("Google Maps not loaded");
      const routesLib = (await google.maps.importLibrary("routes")) as unknown as {
        Route: {
          computeRoutes: (request: unknown) => Promise<{ routes?: unknown[] }>;
        };
      };
      const resolvedLatLng = input.latLng ?? (await resolveWithPlaces(input.address));
      if (!resolvedLatLng) throw new Error("Address not found");

      const tier = getTier(input.durationMinutes);
      const maxCandidates = PLANNER_CONFIG.maxCandidates[tier];
      const baseWaypointCount = tier === "short" ? 6 : tier === "medium" ? 8 : 10;
      const avgSpeed = getAvgSpeed(input.routeCharacter);
      const variationSeed = Math.floor(Math.random() * 1000000);

      const routeWithWaypoints = async (
        allWaypoints: LatLng[],
        stopover: boolean,
      ): Promise<unknown> => {
        const response = await routesLib.Route.computeRoutes({
          origin: resolvedLatLng,
          destination: resolvedLatLng,
          travelMode: google.maps.TravelMode.DRIVING,
          intermediates: allWaypoints.map((point) => ({ location: point, via: !stopover })),
          fields: ["path", "legs"],
        });
        const route = response.routes?.[0];
        if (!route) throw new Error("No route");
        return route;
      };

      const candidates: Array<{
        route: unknown;
        generatedWaypoints: LatLng[];
        score: number;
        durationError: number;
        uturnCount: number;
        overlapRatio: number;
        radiusScale: number;
        waypointCount: number;
        angle: number;
        ellipseRatio: number;
        stopover: boolean;
      }> = [];

      for (let i = 0; i < maxCandidates; i += 1) {
        const waypointCount = Math.max(4, baseWaypointCount + Math.round(randomBetween(-2, 2)));
        const radiusScale = randomBetween(0.72, 1.26);
        const angle = randomBetween(0, 360);
        const ellipseRatio = randomBetween(0.82, 1.18);
        const generatedWaypoints = generateWaypoints(
          resolvedLatLng,
          input.durationMinutes,
          input.routeCharacter,
          radiusScale,
          waypointCount,
          angle,
          ellipseRatio,
        );

        const patterns: Array<{ waypoints: LatLng[]; stopover: boolean }> = [
          { waypoints: generatedWaypoints, stopover: false },
          { waypoints: generatedWaypoints.filter((_, idx) => idx % 2 === 0), stopover: false },
          { waypoints: generatedWaypoints.filter((_, idx) => idx % 2 === 0), stopover: true },
        ];

        for (const pattern of patterns) {
          try {
            const result = await routeWithWaypoints(pattern.waypoints, pattern.stopover);
            const durationError =
              Math.abs(getDurationMinutes(result) - input.durationMinutes) / input.durationMinutes;
            const uturnCount = getUTurnCount(result);
            const overlapRatio = getOverlapRatio(result);
            const deadEndCount = getDeadEndProxy(result);
            const fingerprint = makeFingerprint(result);
            const uniquePenalty = uniquenessPenalty(fingerprint);

            const score =
              durationError * PLANNER_CONFIG.weights.durationError +
              uturnCount * PLANNER_CONFIG.weights.uturn +
              overlapRatio * PLANNER_CONFIG.weights.overlap +
              deadEndCount * PLANNER_CONFIG.weights.deadEnd +
              uniquePenalty * PLANNER_CONFIG.weights.uniquenessPenalty;

            candidates.push({
              route: result,
              generatedWaypoints: pattern.waypoints,
              score,
              durationError,
              uturnCount,
              overlapRatio,
              radiusScale,
              waypointCount,
              angle,
              ellipseRatio,
              stopover: pattern.stopover,
            });

            if (
              durationError <= PLANNER_CONFIG.durationTolerancePrimary &&
              uturnCount === 0 &&
              overlapRatio <= 0.12 &&
              deadEndCount <= 1 &&
              uniquePenalty === 0
            ) {
              i = maxCandidates;
              break;
            }
          } catch {
            // Continue with next candidate.
          }
        }
      }

      if (candidates.length === 0) throw new Error("No route candidates");

      const inPrimaryBand = candidates.filter(
        (c) => c.durationError <= PLANNER_CONFIG.durationTolerancePrimary,
      );
      const inFallbackBand = candidates.filter(
        (c) => c.durationError <= PLANNER_CONFIG.durationToleranceFallback,
      );

      const basePool =
        inPrimaryBand.length > 0
          ? inPrimaryBand
          : inFallbackBand.length > 0
            ? inFallbackBand
            : candidates;
      const noUTurn = basePool.filter((c) => c.uturnCount === 0);
      const lowOverlapNoUTurn = noUTurn.filter((c) => c.overlapRatio <= 0.18);
      const pool = lowOverlapNoUTurn.length > 0 ? lowOverlapNoUTurn : noUTurn.length > 0 ? noUTurn : basePool;
      pool.sort((a, b) => a.score - b.score);
      let best = pool[0];

      if (best.durationError > PLANNER_CONFIG.durationToleranceFallback) {
        const actualMinutes = getDurationMinutes(best.route);
        if (actualMinutes > 0) {
          const adjustedRadiusScale =
            best.radiusScale * (input.durationMinutes / actualMinutes);
          const adjustedWaypoints = generateWaypoints(
            resolvedLatLng,
            input.durationMinutes,
            input.routeCharacter,
            adjustedRadiusScale,
            best.waypointCount,
            best.angle,
            best.ellipseRatio,
          );
          try {
            const adjustedResult = await routeWithWaypoints(
              best.stopover ? adjustedWaypoints.filter((_, idx) => idx % 2 === 0) : adjustedWaypoints,
              best.stopover,
            );
            const adjustedDurationError =
              Math.abs(getDurationMinutes(adjustedResult) - input.durationMinutes) /
              input.durationMinutes;
            if (adjustedDurationError < best.durationError) {
              best = {
                ...best,
                route: adjustedResult,
                generatedWaypoints: best.stopover
                  ? adjustedWaypoints.filter((_, idx) => idx % 2 === 0)
                  : adjustedWaypoints,
                durationError: adjustedDurationError,
              };
            }
          } catch {
            // Keep original best if adjusted retry fails.
          }
        }
      }

      const fingerprint = makeFingerprint(best.route);
      recentFingerprintsRef.current = [
        fingerprint,
        ...recentFingerprintsRef.current.filter((f) => f !== fingerprint),
      ].slice(0, 5);

      setRoutePath(getPathFromRoute(best.route));
      setDealershipAddress(input.address);
      setDealershipLatLng(resolvedLatLng);
      setWaypoints(best.generatedWaypoints);
      setStats(calculateStats(best.route, avgSpeed, input.durationMinutes, variationSeed));
    } catch {
      setRouteError("Could not build a route. Try increasing the duration or changing the route type.");
    } finally {
      setLoading(false);
    }
  };

  if (!apiKey) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <Card>
          <CardContent className="space-y-2 p-6">
            <h1 className="text-xl font-semibold">Missing Google Maps API key</h1>
            <p className="text-sm text-muted-foreground">
              Create `.env.local` with `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_key` and restart `npm run dev`.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <APIProvider apiKey={apiKey} libraries={["places"]}>
      <main className="h-dvh w-full overflow-hidden">
        <header className="flex flex-col justify-between gap-2 border-b bg-card/80 px-3 py-3 sm:flex-row sm:items-center sm:px-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Test Drive Route Planner</h1>
            <p className="text-sm text-muted-foreground">Generate smooth, varied dealership loop routes in one click.</p>
          </div>
          <ThemeToggle />
        </header>

        <section className="grid h-[calc(100dvh-80px)] grid-cols-1 gap-0 lg:grid-cols-[400px_1fr]">
          <div className="space-y-3 overflow-hidden border-b p-3 sm:p-4 lg:h-full lg:border-b-0 lg:border-r">
            {routeError ? (
              <Alert className="border-destructive/70 bg-destructive/20 text-destructive-foreground">
                <AlertTitle>Route generation failed</AlertTitle>
                <AlertDescription>{routeError}</AlertDescription>
              </Alert>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quick Start</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>1. Enter or paste your dealership address.</p>
                <p>2. Pick drive duration and route character.</p>
                <p>3. Click Generate Route and export to navigation apps.</p>
              </CardContent>
            </Card>

            <RouteForm loading={loading} onSubmit={generateRoute} />

            {stats ? (
              <>
                <Separator />
                <RouteStats stats={stats} />
              </>
            ) : null}

            {exports ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Export</CardTitle>
                </CardHeader>
                <CardContent>
                  <ExportButtons googleMapsUrl={exports.googleMapsUrl} />
                </CardContent>
              </Card>
            ) : null}
          </div>

          <div className="space-y-0 overflow-hidden p-0">
            <Card className="h-full rounded-none border-0">
              <CardHeader className="flex-row items-center justify-between space-y-0 px-3 py-3 sm:px-4">
                <CardTitle className="text-base">Route Preview</CardTitle>
                {stats ? (
                  <div className="flex flex-wrap justify-end gap-2">
                    <Badge variant="outline">Seed {stats.variationSeed}</Badge>
                    <Badge variant="outline">Error {stats.durationErrorPct.toFixed(1)}%</Badge>
                    <Badge variant="outline">U-turns {stats.uturnCount}</Badge>
                  </div>
                ) : null}
              </CardHeader>
              <CardContent className="h-[calc(100%-64px)] p-0">
                <RouteMap dealershipLatLng={dealershipLatLng} routePath={routePath} />
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    </APIProvider>
  );
}
