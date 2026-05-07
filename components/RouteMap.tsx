"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Map, useMap } from "@vis.gl/react-google-maps";
import type { LatLng } from "@/types/route";

type RouteMapProps = {
  dealershipLatLng: LatLng | null;
  routePath: LatLng[];
};

const LIGHT_MONOCHROME_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#f5f5f5" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#666666" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f5f5f5" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#dddddd" }] },
];

const DARK_MONOCHROME_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#111827" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9ca3af" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#111827" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1f2937" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0f172a" }] },
];

function DirectionsLayer({
  routePath,
  dealershipLatLng,
}: {
  routePath: LatLng[];
  dealershipLatLng: LatLng | null;
}) {
  const map = useMap();
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const centerCircleRef = useRef<google.maps.Circle | null>(null);

  useEffect(() => {
    if (!map) return;
    polylineRef.current = new google.maps.Polyline({
      strokeColor: "#16a34a",
      strokeOpacity: 0.95,
      strokeWeight: 5,
    });
    polylineRef.current.setMap(map);
    centerCircleRef.current = new google.maps.Circle({
      strokeColor: "#111827",
      strokeOpacity: 0.9,
      strokeWeight: 1.5,
      fillColor: "#111827",
      fillOpacity: 0.8,
      radius: 12,
    });
    centerCircleRef.current.setMap(map);

    return () => {
      polylineRef.current?.setMap(null);
      centerCircleRef.current?.setMap(null);
    };
  }, [map]);

  useEffect(() => {
    if (!map || !polylineRef.current) return;
    if (centerCircleRef.current) {
      if (dealershipLatLng) {
        centerCircleRef.current.setCenter(dealershipLatLng);
      } else {
        centerCircleRef.current.setCenter(null);
      }
    }
    if (routePath.length === 0) {
      polylineRef.current.setPath([]);
      return;
    }
    polylineRef.current.setPath(routePath);
    const bounds = new google.maps.LatLngBounds();
    routePath.forEach((p) => bounds.extend(p));
    if (dealershipLatLng) bounds.extend(dealershipLatLng);
    map.fitBounds(bounds);
  }, [routePath, dealershipLatLng, map]);

  return null;
}

export function RouteMap({ dealershipLatLng, routePath }: RouteMapProps) {
  const center = dealershipLatLng ?? { lat: 40.7128, lng: -74.006 };
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const syncTheme = () => {
      const isDark =
        document.documentElement.classList.contains("dark") ||
        document.documentElement.getAttribute("data-theme") === "dark";
      setDark(isDark);
    };

    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });

    return () => observer.disconnect();
  }, []);

  const mapStyles = useMemo(
    () => (dark ? DARK_MONOCHROME_STYLE : LIGHT_MONOCHROME_STYLE),
    [dark],
  );

  return (
    <div className="h-full w-full overflow-hidden">
      <Map
        defaultZoom={12}
        defaultCenter={center}
        gestureHandling="greedy"
        styles={mapStyles}
        mapTypeControl={false}
      >
        <DirectionsLayer routePath={routePath} dealershipLatLng={dealershipLatLng} />
      </Map>
    </div>
  );
}
