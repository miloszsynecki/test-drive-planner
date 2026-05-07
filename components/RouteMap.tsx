"use client";

import { useEffect, useRef } from "react";
import { Map, Marker, useMap } from "@vis.gl/react-google-maps";
import type { LatLng } from "@/types/route";

type RouteMapProps = {
  dealershipLatLng: LatLng | null;
  directions: google.maps.DirectionsResult | null;
};

const MONOCHROME_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#f5f5f5" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#666666" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f5f5f5" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#dddddd" }] },
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

  return (
    <div className="h-full w-full overflow-hidden">
      <Map
        defaultZoom={12}
        defaultCenter={center}
        gestureHandling="greedy"
        styles={MONOCHROME_STYLE}
      >
        {dealershipLatLng ? <Marker position={dealershipLatLng} /> : null}
        <DirectionsLayer directions={directions} />
      </Map>
    </div>
  );
}
