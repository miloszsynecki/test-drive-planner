"use client";

import { useEffect, useRef, useState } from "react";
import type { LatLng } from "@/types/route";

type AddressInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSelect: (address: string, latLng: LatLng) => void;
  error?: string;
};

function PinIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 1.5C7 1.5 4.5 4 4.5 7c0 4.5 5.5 11 5.5 11s5.5-6.5 5.5-11c0-3-2.5-5.5-5.5-5.5Z" />
      <circle cx="10" cy="7" r="1.8" />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="14" height="14" rx="1" />
      <path d="M3 8h14M8 8v9" />
    </svg>
  );
}

export function AddressInput({ value, onChange, onSelect, error }: AddressInputProps) {
  const [predictions, setPredictions] = useState<Array<{ id: string; label: string; sublabel: string; raw: unknown }>>([]);
  const [open, setOpen] = useState(false);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

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
          ) => Promise<{
            suggestions?: Array<{
              placePrediction?: {
                placeId?: string;
                text?: { text?: string };
                structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
              };
            }>;
          }>;
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
              const label = prediction?.structuredFormat?.mainText?.text ?? prediction?.text?.text ?? "";
              const sublabel = prediction?.structuredFormat?.secondaryText?.text ?? "";
              if (!id || !label) return null;
              return { id, label, sublabel, raw: suggestion };
            })
            .filter(Boolean) as Array<{ id: string; label: string; sublabel: string; raw: unknown }>;
          setPredictions(next);
          setOpen(true);
        })
        .catch(() => setPredictions([]));
    }, 300);

    return () => clearTimeout(timeout);
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectPrediction = async (prediction: { id: string; label: string; sublabel: string; raw: unknown }) => {
    const placePrediction = (prediction.raw as {
      placePrediction?: {
        toPlace?: () => {
          fetchFields?: (input: unknown) => Promise<void>;
          formattedAddress?: string;
          location?: { lat: () => number; lng: () => number };
        };
      };
    }).placePrediction;
    const place = placePrediction?.toPlace?.();
    if (!place?.fetchFields) return;

    try {
      await place.fetchFields({ fields: ["formattedAddress", "location"] });
      if (!place.location || !place.formattedAddress) return;
      const latLng = { lat: place.location.lat(), lng: place.location.lng() };
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
    <div ref={wrapRef} style={{ position: "relative" }}>
      <div className={`tdp-input${error ? " error" : ""}`}>
        <span className="tdp-input-icon"><PinIcon /></span>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => predictions.length > 0 && setOpen(true)}
          placeholder="Search dealership address"
        />
      </div>

      {open && predictions.length > 0 && (
        <div className="tdp-suggestions">
          {predictions.map((prediction) => (
            <button
              key={prediction.id}
              type="button"
              className="tdp-suggestion"
              style={{ width: "100%", background: "none", border: "none", textAlign: "left", cursor: "pointer" }}
              onClick={() => selectPrediction(prediction)}
            >
              <span className="tdp-suggestion-icon"><BuildingIcon /></span>
              <span className="tdp-suggestion-text">
                <span className="tdp-suggestion-title">{prediction.label}</span>
                {prediction.sublabel && (
                  <span className="tdp-suggestion-sub">{prediction.sublabel}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      {error && <div className="tdp-error-msg" style={{ marginTop: 5 }}>{error}</div>}
    </div>
  );
}
