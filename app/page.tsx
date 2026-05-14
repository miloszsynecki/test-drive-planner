"use client";

import { useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { APIProvider } from "@vis.gl/react-google-maps";
import { AlertTriangle } from "lucide-react";
import { ExportButtons } from "@/components/ExportButtons";
import { RouteForm } from "@/components/RouteForm";
import { RouteStats } from "@/components/RouteStats";
import { ThemeToggle } from "@/components/ThemeToggle";
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

function CarRoadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 13L4 17L20 17L20 13L18 8Q17.5 7 16.5 7L7.5 7Q6.5 7 6 8Z"
        stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="8" cy="17" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="16" cy="17" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 20L21 20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2 3" />
    </svg>
  );
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
      const response = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: address, sessionToken: token });
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
    fallbackLevel: "primary-stopover" | "sparse-stopover",
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
        Route: { computeRoutes: (request: unknown) => Promise<{ routes?: unknown[] }> };
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
          const adjustedRadiusScale = best.radiusScale * (input.durationMinutes / actualMinutes);
          const adjustedWaypoints = generateWaypoints(
            resolvedLatLng, input.durationMinutes, input.routeCharacter,
            adjustedRadiusScale, best.waypointCount, best.angle, best.ellipseRatio,
          );
          try {
            const adjustedResult = await provider.computeRoute(adjustedWaypoints);
            const adjustedDurationError = Math.abs(getDurationMinutes(adjustedResult) - input.durationMinutes) / input.durationMinutes;
            const adjustedUTurnCount = getUTurnCount(adjustedResult);
            if (adjustedDurationError < best.durationError && adjustedUTurnCount === 0) {
              best = {
                ...best, route: adjustedResult,
                generatedWaypoints: adjustedWaypoints,
                durationError: adjustedDurationError,
                fallbackLevel: "primary-stopover",
                uturnCount: adjustedUTurnCount,
              };
            }
          } catch { /* keep original */ }
        }
      }

      const fingerprint = selection.bestFingerprint;
      recentFingerprintsRef.current = [fingerprint, ...recentFingerprintsRef.current.filter((f) => f !== fingerprint)].slice(0, 5);

      setRoutePath(getPathFromRoute(best.route));
      setDealershipAddress(input.address);
      setDealershipLatLng(resolvedLatLng);
      setWaypoints(best.generatedWaypoints);
      setStats(calculateStats(best.route, avgSpeed, input.durationMinutes, variationSeed, best.fallbackLevel, usedUTurnFallback));
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
      <div className="flex h-dvh">
        <aside className="flex w-[400px] shrink-0 flex-col gap-5 border-r border-sidebar-border bg-sidebar p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] border border-border bg-secondary text-primary">
              <CarRoadIcon />
            </div>
            <p className="font-mono text-[12.5px] font-medium uppercase tracking-[0.07em]">
              Test Drive · Route Planner
            </p>
          </div>
          <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">Missing API key</p>
            <p>
              Create <code className="font-mono text-xs text-primary">.env.local</code> with{" "}
              <code className="font-mono text-xs">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_key</code> and restart the dev server.
            </p>
          </div>
        </aside>
        <div className="flex-1 bg-background" />
      </div>
    );
  }

  const footerStatus = loading ? loadingMessage : stats ? "Route ready" : "Idle";

  return (
    <APIProvider apiKey={apiKey} libraries={["places"]}>
      <div className="flex h-dvh">

        {/* ── Left panel ── */}
        <aside className="flex w-[400px] shrink-0 flex-col gap-5 overflow-hidden border-r border-sidebar-border bg-sidebar p-6">

          {/* Header */}
          <div className="flex shrink-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] border border-border bg-secondary text-primary">
              <CarRoadIcon />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[12.5px] font-medium uppercase tracking-[0.07em]">
                Test Drive · Route Planner
              </p>
              <p className="truncate text-[11.5px] text-muted-foreground">
                Generate the perfect route for every customer
              </p>
            </div>
            <ThemeToggle />
          </div>

          {/* Scrollable content */}
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {routeError && (
              <div className="flex gap-2.5 rounded-xl border border-destructive bg-destructive/10 p-3.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div>
                  <p className="mb-0.5 text-sm font-medium">Could not build a route</p>
                  <p className="text-xs text-muted-foreground">{routeError}</p>
                </div>
              </div>
            )}
            {!routeError && routeNotice && (
              <div className="flex gap-2.5 rounded-xl border border-yellow-500/40 bg-yellow-500/8 p-3.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
                <div>
                  <p className="mb-0.5 text-sm font-medium">Route quality notice</p>
                  <p className="text-xs text-muted-foreground">{routeNotice}</p>
                </div>
              </div>
            )}

            <RouteForm loading={loading} loadingMessage={loadingMessage} onSubmit={generateRoute} />

            {stats && <RouteStats stats={stats} />}

            {exports && (
              <div>
                <SectionLabel>Export route</SectionLabel>
                <ExportButtons googleMapsUrl={exports.googleMapsUrl} wazeUrl={exports.wazeUrl} />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex shrink-0 items-center justify-between border-t border-sidebar-border pt-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              {footerStatus}
            </div>
            <span>v 2.4.0</span>
          </div>
        </aside>

        {/* ── Map panel ── */}
        <div className="relative flex-1 overflow-hidden bg-background">
          <RouteMap dealershipLatLng={dealershipLatLng} routePath={routePath} />
        </div>
      </div>
    </APIProvider>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
      <span>{children}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
