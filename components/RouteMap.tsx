"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Map, Marker, useMap } from "@vis.gl/react-google-maps";
import type { LatLng } from "@/types/route";

type RouteMapProps = {
  dealershipLatLng: LatLng | null;
  directions: google.maps.DirectionsResult | null;
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

function DirectionsLayer({ directions }: { directions: google.maps.DirectionsResult | null }) {
  const map = useMap();
  const rendererRef = useRef<google.maps.DirectionsRenderer | null>(null);

  useEffect(() => {
    if (!map) return;
    rendererRef.current = new google.maps.DirectionsRenderer({
      suppressMarkers: true,
      polylineOptions: {
        strokeColor: "#16a34a",
        strokeOpacity: 0.95,
        strokeWeight: 5,
      },
    });
    rendererRef.current.setMap(map);

    return () => rendererRef.current?.setMap(null);
  }, [map]);

  useEffect(() => {
    if (!map || !rendererRef.current || !directions) return;
    rendererRef.current.setDirections(directions);
    map.fitBounds(directions.routes[0].bounds);
  }, [directions, map]);

  return null;
}

export function RouteMap({ dealershipLatLng, directions }: RouteMapProps) {
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
        {dealershipLatLng ? <Marker position={dealershipLatLng} /> : null}
        <DirectionsLayer directions={directions} />
      </Map>
    </div>
  );
}
