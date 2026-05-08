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
import { createGoogleRouteProvider } from "@/lib/googleRoutesProvider";
import { toUserRouteError } from "@/lib/routeErrors";
import { DEFAULT_PLANNER_CONFIG, planRoute } from "@/lib/routePlanner";
import {
  getDurationMinutes,
  getLegs,
  getOverlapRatio,
  getPathFromRoute,
  getUTurnCount,
} from "@/lib/routeMetrics";
import type { GeneratedRouteStats, LatLng, RouteCharacter } from "@/types/route";

const RouteMap = dynamic(
  () => import("@/components/RouteMap").then((m) => m.RouteMap),
  { ssr: false },
);

export default function Page() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [loading, setLoading] = useState(false);
  const [routePath, setRoutePath] = useState<LatLng[]>([]);
  const [dealershipAddress, setDealershipAddress] = useState("");
  const [dealershipLatLng, setDealershipLatLng] = useState<LatLng | null>(null);
  const [waypoints, setWaypoints] = useState<LatLng[]>([]);
  const [stats, setStats] = useState<GeneratedRouteStats | null>(null);
  const [routeError, setRouteError] = useState("");
  const [routeNotice, setRouteNotice] = useState("");
  const [loadingMessage, setLoadingMessage] = useState("Finding best route...");
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

  const calculateStats = (
    route: unknown,
    avgSpeedKmh: number,
    requestedMinutes: number,
    variationSeed: number,
    fallbackLevel: "strict-via" | "sparse-via" | "sparse-stopover",
    usedUTurnFallback: boolean,
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
      fallbackLevel,
      usedUTurnFallback,
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
    setRouteNotice("");
    setLoadingMessage("Resolving address...");

    try {
      if (!window.google?.maps) throw new Error("Google Maps not loaded");
      const routesLib = (await google.maps.importLibrary("routes")) as unknown as {
        Route: {
          computeRoutes: (request: unknown) => Promise<{ routes?: unknown[] }>;
        };
      };
      const resolvedLatLng = input.latLng ?? (await resolveWithPlaces(input.address));
      if (!resolvedLatLng) throw new Error("Address not found");

      const avgSpeed = getAvgSpeed(input.routeCharacter);
      const variationSeed = Math.floor(Math.random() * 1000000);

      const provider = createGoogleRouteProvider(routesLib, resolvedLatLng);
      setLoadingMessage("Generating loop options...");

      const selection = await planRoute({
        origin: resolvedLatLng,
        durationMinutes: input.durationMinutes,
        routeCharacter: input.routeCharacter,
        config: DEFAULT_PLANNER_CONFIG,
        recentFingerprints: recentFingerprintsRef.current,
        computeRoute: provider.computeRoute,
        onProgress: (message) => setLoadingMessage(message),
      });
      let best = selection.best;
      const usedUTurnFallback = selection.usedUTurnFallback;

      if (best.durationError > DEFAULT_PLANNER_CONFIG.durationToleranceFallback) {
        setLoadingMessage("Tuning route duration...");
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
            const adjustedResult = await provider.computeRoute(
              best.stopover ? adjustedWaypoints.filter((_, idx) => idx % 2 === 0) : adjustedWaypoints,
              best.stopover,
            );
            const adjustedDurationError =
              Math.abs(getDurationMinutes(adjustedResult) - input.durationMinutes) /
              input.durationMinutes;
            const adjustedUTurnCount = getUTurnCount(adjustedResult);
            if (adjustedDurationError < best.durationError && adjustedUTurnCount === 0) {
              best = {
                ...best,
                route: adjustedResult,
                generatedWaypoints: best.stopover
                  ? adjustedWaypoints.filter((_, idx) => idx % 2 === 0)
                  : adjustedWaypoints,
                durationError: adjustedDurationError,
                fallbackLevel: best.stopover ? "sparse-stopover" : "strict-via",
                uturnCount: adjustedUTurnCount,
              };
            }
          } catch {
            // Keep original best if adjusted retry fails.
          }
        }
      }

      const fingerprint = selection.bestFingerprint;
      recentFingerprintsRef.current = [
        fingerprint,
        ...recentFingerprintsRef.current.filter((f) => f !== fingerprint),
      ].slice(0, 5);

      setRoutePath(getPathFromRoute(best.route));
      setDealershipAddress(input.address);
      setDealershipLatLng(resolvedLatLng);
      setWaypoints(best.generatedWaypoints);
      setStats(
        calculateStats(
          best.route,
          avgSpeed,
          input.durationMinutes,
          variationSeed,
          best.fallbackLevel,
          usedUTurnFallback,
        ),
      );
      if (usedUTurnFallback) {
        setRouteNotice("No U-turn-free route was found. Showing the best available route with minimal U-turns.");
      }
    } catch (error) {
      setRouteNotice("");
      setRouteError(toUserRouteError(error));
    } finally {
      setLoadingMessage("Finding best route...");
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
            {!routeError && routeNotice ? (
              <Alert>
                <AlertTitle>Route quality notice</AlertTitle>
                <AlertDescription>{routeNotice}</AlertDescription>
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

            <RouteForm loading={loading} loadingMessage={loadingMessage} onSubmit={generateRoute} />

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
