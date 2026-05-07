"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { LatLng } from "@/types/route";

type AddressInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSelect: (address: string, latLng: LatLng) => void;
  error?: string;
};

export function AddressInput({ value, onChange, onSelect, error }: AddressInputProps) {
  const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [open, setOpen] = useState(false);
  const autocompleteServiceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  useEffect(() => {
    if (!window.google?.maps?.places) return;
    autocompleteServiceRef.current = new google.maps.places.AutocompleteService();
    placesServiceRef.current = new google.maps.places.PlacesService(document.createElement("div"));
  }, []);

  useEffect(() => {
    if (!autocompleteServiceRef.current || value.trim().length < 3) {
      setPredictions([]);
      return;
    }

    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
    }

    const timeout = setTimeout(() => {
      autocompleteServiceRef.current?.getPlacePredictions(
        {
          input: value,
          sessionToken: sessionTokenRef.current ?? undefined,
        },
        (result) => {
          setPredictions(result ?? []);
          setOpen(true);
        },
      );
    }, 300);

    return () => clearTimeout(timeout);
  }, [value]);

  const selectPrediction = (prediction: google.maps.places.AutocompletePrediction) => {
    const service = placesServiceRef.current;
    if (!service) return;

    service.getDetails(
      {
        placeId: prediction.place_id,
        fields: ["formatted_address", "geometry"],
        sessionToken: sessionTokenRef.current ?? undefined,
      },
      (place) => {
        if (!place?.geometry?.location || !place.formatted_address) return;
        const latLng = {
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        };
        onChange(place.formatted_address);
        onSelect(place.formatted_address, latLng);
        setOpen(false);
        setPredictions([]);
        sessionTokenRef.current = null;
      },
    );
  };

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => predictions.length > 0 && setOpen(true)}
        placeholder="123 Main St, City"
      />
      {open && predictions.length > 0 ? (
        <div className="absolute z-40 mt-1 w-full rounded-md border bg-card p-1 shadow-lg">
          {predictions.map((prediction) => (
            <button
              key={prediction.place_id}
              className="w-full rounded px-3 py-2 text-left text-sm hover:bg-muted"
              type="button"
              onClick={() => selectPrediction(prediction)}
            >
              {prediction.description}
            </button>
          ))}
        </div>
      ) : null}
      {error ? <p className={cn("mt-1 text-sm text-red-400")}>{error}</p> : null}
    </div>
  );
}
