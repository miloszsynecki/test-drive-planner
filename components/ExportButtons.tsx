"use client";

import { useState } from "react";

type ExportButtonsProps = {
  googleMapsUrl: string;
  wazeUrl: string;
};

function MapPinIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 1.5C7 1.5 4.5 4 4.5 7c0 4.5 5.5 11 5.5 11s5.5-6.5 5.5-11c0-3-2.5-5.5-5.5-5.5Z" />
      <circle cx="10" cy="7" r="1.8" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11.5 2L4 11h6l-1.5 7 7.5-9h-6L11.5 2Z" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="7" y="7" width="10" height="10" rx="2" />
      <path d="M3 13V4a1 1 0 0 1 1-1h9" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10l4.5 4.5L16 6" />
    </svg>
  );
}

export function ExportButtons({ googleMapsUrl, wazeUrl }: ExportButtonsProps) {
  const [copied, setCopied] = useState(false);
  const isValidUrl = /^https?:\/\/.+/i.test(googleMapsUrl);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(googleMapsUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable
    }
  };

  return (
    <div className="export-row">
      {isValidUrl ? (
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noreferrer"
          className="tdp-btn tdp-btn-primary export-btn"
        >
          <MapPinIcon />
          <span className="export-label">Open in Google Maps</span>
          <span className="export-tail">↗</span>
        </a>
      ) : (
        <button className="tdp-btn tdp-btn-primary export-btn" disabled>
          <MapPinIcon />
          <span className="export-label">Open in Google Maps</span>
        </button>
      )}

      <a
        href={wazeUrl}
        target="_blank"
        rel="noreferrer"
        className="tdp-btn tdp-btn-secondary export-btn"
      >
        <BoltIcon />
        <span className="export-label">Open in Waze</span>
        <span className="export-tail">↗</span>
      </a>

      <button
        className={`tdp-btn ${copied ? "tdp-btn-success" : "tdp-btn-ghost"} export-btn`}
        disabled={!isValidUrl}
        onClick={handleCopy}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
        <span className="export-label">{copied ? "Copied ✓" : "Copy Link"}</span>
        {!copied && <span className="export-tail">⌘L</span>}
      </button>
    </div>
  );
}
