"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Map, useMap } from "@vis.gl/react-google-maps";
import type { LatLng } from "@/types/route";

type RouteMapProps = {
  dealershipLatLng: LatLng | null;
  routePath: LatLng[];
};

const LIGHT_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#eef0f4" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9aa1ad" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#eef0f4" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#d4d8df" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#e6e9ee" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#d8e6f4" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#dde9d8" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

const DARK_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#0d1117" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#3a414e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0d1117" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#252b36" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#1a1f28" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0d1a26" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#13201a" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

function DirectionsLayer({
  routePath,
  dealershipLatLng,
  accentColor,
}: {
  routePath: LatLng[];
  dealershipLatLng: LatLng | null;
  accentColor: string;
}) {
  const map = useMap();
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const dealerMarkerRef = useRef<google.maps.Circle | null>(null);

  useEffect(() => {
    if (!map) return;
    polylineRef.current = new google.maps.Polyline({
      strokeColor: accentColor,
      strokeOpacity: 0.9,
      strokeWeight: 5,
    });
    polylineRef.current.setMap(map);

    dealerMarkerRef.current = new google.maps.Circle({
      strokeColor: accentColor,
      strokeOpacity: 1,
      strokeWeight: 2,
      fillColor: accentColor,
      fillOpacity: 0.9,
      radius: 18,
    });
    dealerMarkerRef.current.setMap(map);

    return () => {
      polylineRef.current?.setMap(null);
      dealerMarkerRef.current?.setMap(null);
    };
  }, [map, accentColor]);

  useEffect(() => {
    if (!map || !polylineRef.current) return;

    if (dealerMarkerRef.current) {
      dealerMarkerRef.current.setCenter(dealershipLatLng ?? null);
    }

    if (routePath.length === 0) {
      polylineRef.current.setPath([]);
      return;
    }

    polylineRef.current.setPath(routePath);
    const bounds = new google.maps.LatLngBounds();
    routePath.forEach((p) => bounds.extend(p));
    if (dealershipLatLng) bounds.extend(dealershipLatLng);
    map.fitBounds(bounds, 60);
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
    () => (dark ? DARK_MAP_STYLE : LIGHT_MAP_STYLE),
    [dark],
  );

  const accentColor = dark ? "#00aaff" : "#0a84ff";

  return (
    <div className="h-full w-full overflow-hidden">
      <Map
        defaultZoom={12}
        defaultCenter={center}
        gestureHandling="greedy"
        styles={mapStyles}
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={false}
        zoomControlOptions={{ position: 3 }}
      >
        <DirectionsLayer routePath={routePath} dealershipLatLng={dealershipLatLng} accentColor={accentColor} />
      </Map>
    </div>
  );
}
