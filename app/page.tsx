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
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
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
    return new Promise((resolve) => {
      const service = new google.maps.places.PlacesService(document.createElement("div"));
      service.findPlaceFromQuery(
        {
          query: address,
          fields: ["geometry"],
        },
        (results, status) => {
          if (
            status !== google.maps.places.PlacesServiceStatus.OK ||
            !results?.[0]?.geometry?.location
          ) {
            resolve(null);
            return;
          }
          const location = results[0].geometry.location;
          resolve({ lat: location.lat(), lng: location.lng() });
        },
      );
    });
  };

  const getDurationMinutes = (result: google.maps.DirectionsResult): number =>
    result.routes[0].legs.reduce((sum, leg) => sum + (leg.duration?.value ?? 0), 0) / 60;

  const getUTurnCount = (result: google.maps.DirectionsResult): number => {
    const steps = result.routes[0].legs.flatMap((leg) => leg.steps ?? []);
    return steps.filter((s) => (s.maneuver ?? "").includes("uturn")).length;
  };

  const getOverlapRatio = (result: google.maps.DirectionsResult): number => {
    const routePath = result.routes[0].overview_path ?? [];
    const visited = new Set<string>();
    let repeated = 0;
    for (const p of routePath) {
      const key = `${p.lat().toFixed(4)}:${p.lng().toFixed(4)}`;
      if (visited.has(key)) repeated += 1;
      visited.add(key);
    }
    return routePath.length > 0 ? repeated / routePath.length : 0;
  };

  const getDeadEndProxy = (result: google.maps.DirectionsResult): number => {
    const steps = result.routes[0].legs.flatMap((leg) => leg.steps ?? []);
    let count = 0;
    for (let i = 1; i < steps.length; i += 1) {
      const prev = steps[i - 1];
      const curr = steps[i];
      const prevManeuver = prev.maneuver ?? "";
      const currManeuver = curr.maneuver ?? "";
      const shortOutAndBack =
        (prev.distance?.value ?? 0) < 90 &&
        (curr.distance?.value ?? 0) < 90 &&
        prevManeuver.startsWith("turn") &&
        currManeuver.startsWith("turn");
      if (shortOutAndBack) count += 1;
    }
    return count;
  };

  const makeFingerprint = (result: google.maps.DirectionsResult): string => {
    const path = result.routes[0].overview_path ?? [];
    return path
      .filter((_, idx) => idx % 4 === 0)
      .map((p) => `${p.lat().toFixed(3)}:${p.lng().toFixed(3)}`)
      .join("|");
  };

  const uniquenessPenalty = (fingerprint: string): number => {
    if (recentFingerprintsRef.current.length === 0) return 0;
    const exact = recentFingerprintsRef.current.includes(fingerprint);
    return exact ? 1 : 0;
  };

  const calculateStats = (
    result: google.maps.DirectionsResult,
    avgSpeedKmh: number,
    requestedMinutes: number,
    variationSeed: number,
  ): GeneratedRouteStats => {
    const route = result.routes[0];
    const totalMeters = route.legs.reduce((sum, leg) => sum + (leg.distance?.value ?? 0), 0);
    const totalSeconds = route.legs.reduce((sum, leg) => sum + (leg.duration?.value ?? 0), 0);
    const totalDurationMinutes = totalSeconds / 60;

    return {
      totalDistanceKm: totalMeters / 1000,
      totalDurationMinutes,
      waypointCount: route.legs.length - 1,
      avgSpeedKmh,
      durationErrorPct: (Math.abs(totalDurationMinutes - requestedMinutes) / requestedMinutes) * 100,
      uturnCount: getUTurnCount(result),
      overlapRatio: getOverlapRatio(result),
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
      const service = new google.maps.DirectionsService();
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
      ): Promise<google.maps.DirectionsResult> => {
        return service.route({
          origin: resolvedLatLng,
          destination: resolvedLatLng,
          optimizeWaypoints: false,
          travelMode: google.maps.TravelMode.DRIVING,
          waypoints: allWaypoints.map((point) => ({ location: point, stopover })),
        });
      };

      const candidates: Array<{
        result: google.maps.DirectionsResult;
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
              result,
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
        const actualMinutes = getDurationMinutes(best.result);
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
                result: adjustedResult,
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

      const fingerprint = makeFingerprint(best.result);
      recentFingerprintsRef.current = [
        fingerprint,
        ...recentFingerprintsRef.current.filter((f) => f !== fingerprint),
      ].slice(0, 5);

      setDirections(best.result);
      setDealershipAddress(input.address);
      setDealershipLatLng(resolvedLatLng);
      setWaypoints(best.generatedWaypoints);
      setStats(calculateStats(best.result, avgSpeed, input.durationMinutes, variationSeed));
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
                <RouteMap dealershipLatLng={dealershipLatLng} directions={directions} />
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    </APIProvider>
  );
}
