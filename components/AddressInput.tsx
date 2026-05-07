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
  const [predictions, setPredictions] = useState<Array<{ id: string; label: string; raw: unknown }>>([]);
  const [open, setOpen] = useState(false);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  useEffect(() => {
    if (!window.google?.maps?.places || value.trim().length < 3) {
      Promise.resolve().then(() => setPredictions([]));
      return;
    }

    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
    }

    const timeout = setTimeout(() => {
      const places = window.google.maps.places as unknown as {
        AutocompleteSuggestion?: {
          fetchAutocompleteSuggestions: (
            request: unknown,
          ) => Promise<{ suggestions?: Array<{ placePrediction?: { placeId?: string; text?: { text?: string } } }> }>;
        };
      };

      places.AutocompleteSuggestion?.fetchAutocompleteSuggestions({
        input: value,
        sessionToken: sessionTokenRef.current ?? undefined,
      })
        .then((response) => {
          const next = (response.suggestions ?? [])
            .map((suggestion) => {
              const prediction = suggestion.placePrediction;
              const id = prediction?.placeId ?? "";
              const label = prediction?.text?.text ?? "";
              if (!id || !label) return null;
              return { id, label, raw: suggestion };
            })
            .filter((item): item is { id: string; label: string; raw: unknown } => Boolean(item));
          setPredictions(next);
          setOpen(true);
        })
        .catch(() => setPredictions([]));
    }, 300);

    return () => clearTimeout(timeout);
  }, [value]);

  const selectPrediction = async (prediction: { id: string; label: string; raw: unknown }) => {
    const placePrediction = (prediction.raw as { placePrediction?: { toPlace?: () => { fetchFields?: (input: unknown) => Promise<void>; formattedAddress?: string; location?: { lat: () => number; lng: () => number } } } }).placePrediction;
    const place = placePrediction?.toPlace?.();
    if (!place?.fetchFields) return;

    try {
      await place.fetchFields({ fields: ["formattedAddress", "location"] });
      if (!place.location || !place.formattedAddress) return;
      const latLng = {
        lat: place.location.lat(),
        lng: place.location.lng(),
      };
      onChange(place.formattedAddress);
      onSelect(place.formattedAddress, latLng);
      setOpen(false);
      setPredictions([]);
      sessionTokenRef.current = null;
    } catch {
      // Keep current state; user can retry selection.
    }
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
              key={prediction.id}
              className="w-full rounded px-3 py-2 text-left text-sm hover:bg-muted"
              type="button"
              onClick={() => selectPrediction(prediction)}
            >
              {prediction.label}
            </button>
          ))}
        </div>
      ) : null}
      {error ? <p className={cn("mt-1 text-sm text-red-400")}>{error}</p> : null}
    </div>
  );
}
