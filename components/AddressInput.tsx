"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Building2 } from "lucide-react";
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
          fetchAutocompleteSuggestions: (request: unknown) => Promise<{
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
            .map((s) => {
              const p = s.placePrediction;
              const id = p?.placeId ?? "";
              const label = p?.structuredFormat?.mainText?.text ?? p?.text?.text ?? "";
              const sublabel = p?.structuredFormat?.secondaryText?.text ?? "";
              if (!id || !label) return null;
              return { id, label, sublabel, raw: s };
            })
            .filter(Boolean) as Array<{ id: string; label: string; sublabel: string; raw: unknown }>;
          setPredictions(next);
          setOpen(true);
        })
        .catch(() => setPredictions([]));
    }, 300);
    return () => clearTimeout(timeout);
  }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
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
      onChange(place.formattedAddress);
      onSelect(place.formattedAddress, { lat: place.location.lat(), lng: place.location.lng() });
      setOpen(false);
      setPredictions([]);
      sessionTokenRef.current = null;
    } catch { /* keep current state */ }
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => predictions.length > 0 && setOpen(true)}
          placeholder="Search dealership address"
          className={cn("pl-9 bg-input", error && "border-destructive focus-visible:ring-destructive")}
        />
      </div>

      {open && predictions.length > 0 && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          {predictions.map((p) => (
            <button
              key={p.id}
              type="button"
              className="flex w-full items-center gap-2.5 border-b border-border/60 px-3.5 py-2.5 text-left last:border-b-0 hover:bg-muted/60 focus:bg-muted/60 focus:outline-none"
              onClick={() => selectPrediction(p)}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Building2 className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] text-foreground">{p.label}</span>
                {p.sublabel && (
                  <span className="block truncate text-[11px] text-muted-foreground">{p.sublabel}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      {error && <p className="mt-1.5 font-mono text-[11.5px] text-destructive">{error}</p>}
    </div>
  );
}
