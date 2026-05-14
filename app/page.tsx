"use client";

import { useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { APIProvider } from "@vis.gl/react-google-maps";
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
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 13L4 17L20 17L20 13L18 8Q17.5 7 16.5 7L7.5 7Q6.5 7 6 8Z"
        stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
      />
      <circle cx="8" cy="17" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="16" cy="17" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 20L21 20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2 3" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
      <path d="M10 2L18.5 17H1.5L10 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M10 8V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="10" cy="14" r="0.75" fill="currentColor" />
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
      <div className="app-shell">
        <div className="left-panel">
          <div className="app-head">
            <div className="app-mark"><CarRoadIcon /></div>
            <div className="app-title-wrap">
              <div className="app-title">Test Drive · Route Planner</div>
            </div>
          </div>
          <div className="card">
            <div className="card-head"><span className="card-label">Configuration required</span></div>
            <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6 }}>
              Create <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--accent)" }}>.env.local</code> with{" "}
              <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text)" }}>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_key</code> and restart the dev server.
            </p>
          </div>
        </div>
        <div className="right-panel" />
      </div>
    );
  }

  const footerStatus = loading ? loadingMessage : stats ? "Route ready" : "Idle";

  return (
    <APIProvider apiKey={apiKey} libraries={["places"]}>
      <div className="app-shell">
        {/* ── Left panel ── */}
        <aside className="left-panel">
          {/* App header */}
          <div className="app-head">
            <div className="app-mark"><CarRoadIcon /></div>
            <div className="app-title-wrap">
              <div className="app-title">Test Drive · Route Planner</div>
              <div className="app-tagline">Generate the perfect route for every customer</div>
            </div>
            <ThemeToggle />
          </div>

          {/* Scrollable content */}
          <div className="left-scroll">
            {routeError && (
              <div className="alert-banner">
                <span className="banner-icon"><AlertIcon /></span>
                <div>
                  <div className="banner-title">Could not build a route</div>
                  <div className="banner-msg">{routeError}</div>
                </div>
              </div>
            )}
            {!routeError && routeNotice && (
              <div className="notice-banner">
                <span className="banner-icon"><AlertIcon /></span>
                <div>
                  <div className="banner-title">Route quality notice</div>
                  <div className="banner-msg">{routeNotice}</div>
                </div>
              </div>
            )}

            <RouteForm loading={loading} loadingMessage={loadingMessage} onSubmit={generateRoute} />

            {stats && <RouteStats stats={stats} />}

            {exports && (
              <div>
                <div className="panel-section-title" style={{ marginBottom: 10 }}>Export route</div>
                <ExportButtons googleMapsUrl={exports.googleMapsUrl} wazeUrl={exports.wazeUrl} />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="panel-foot">
            <span className="panel-foot-live">{footerStatus}</span>
            <span>v 2.4.0</span>
          </div>
        </aside>

        {/* ── Right panel (map) ── */}
        <div className="right-panel">
          <RouteMap dealershipLatLng={dealershipLatLng} routePath={routePath} />
        </div>
      </div>
    </APIProvider>
  );
}
