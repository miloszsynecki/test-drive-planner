"use client";

import { useState } from "react";
import { AddressInput } from "@/components/AddressInput";
import type { LatLng, RouteCharacter } from "@/types/route";

type RouteFormProps = {
  loading: boolean;
  loadingMessage?: string;
  onSubmit: (input: {
    address: string;
    latLng: LatLng | null;
    durationMinutes: number;
    routeCharacter: RouteCharacter;
  }) => Promise<void> | void;
};

function TimerIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="10" cy="11" r="7" />
      <path d="M10 7v4l2.5 2.5" />
      <path d="M7.5 2.5h5M10 2.5v2" />
    </svg>
  );
}

function RouteIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
      <path d="M16 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
      <path d="M4 5c0 6 4 4 6 8s6 2 6 6" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

export function RouteForm({ loading, loadingMessage, onSubmit }: RouteFormProps) {
  const [address, setAddress] = useState("");
  const [selectedLatLng, setSelectedLatLng] = useState<LatLng | null>(null);
  const [durationMinutes, setDurationMinutes] = useState("20");
  const [routeCharacter, setRouteCharacter] = useState<RouteCharacter>("mixed");
  const [addressError, setAddressError] = useState("");

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-label">Route parameters</span>
      </div>
      <form
        className="form-fields"
        onSubmit={(e) => {
          e.preventDefault();
          if (!address.trim()) {
            setAddressError("Enter a dealership address to continue.");
            return;
          }
          setAddressError("");
          onSubmit({
            address,
            latLng: selectedLatLng,
            durationMinutes: Number(durationMinutes),
            routeCharacter,
          });
        }}
      >
        <div className="field">
          <div className="field-label">Dealership address</div>
          <AddressInput
            value={address}
            onChange={(v) => {
              setAddress(v);
              setSelectedLatLng(null);
            }}
            onSelect={(_, latLng) => {
              setSelectedLatLng(latLng);
              setAddressError("");
            }}
            error={addressError}
          />
        </div>

        <div className="field">
          <div className="field-label">Test drive duration</div>
          <div className="tdp-input">
            <span className="tdp-input-icon"><TimerIcon /></span>
            <select
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
            >
              {[15, 20, 30, 45, 60].map((m) => (
                <option key={m} value={String(m)}>{m} minutes</option>
              ))}
            </select>
            <span className="tdp-input-trail"><ChevronIcon /></span>
          </div>
        </div>

        <div className="field">
          <div className="field-label">Route character</div>
          <div className="tdp-input">
            <span className="tdp-input-icon"><RouteIcon /></span>
            <select
              value={routeCharacter}
              onChange={(e) => setRouteCharacter(e.target.value as RouteCharacter)}
            >
              <option value="city">City Streets</option>
              <option value="mixed">Mixed</option>
              <option value="highway">Highway Taste</option>
              <option value="scenic">Scenic &amp; Winding</option>
            </select>
            <span className="tdp-input-trail"><ChevronIcon /></span>
          </div>
        </div>

        <button
          type="submit"
          className="tdp-btn tdp-btn-primary tdp-btn-full"
          disabled={loading}
          style={{ marginTop: 2 }}
        >
          {loading ? (
            <>
              <span className="tdp-spinner" />
              {loadingMessage ?? "Finding best route..."}
            </>
          ) : (
            "Generate Route"
          )}
        </button>
      </form>
    </div>
  );
}
