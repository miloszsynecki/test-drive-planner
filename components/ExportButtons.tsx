"use client";

import { useState } from "react";
import { MapPin, Zap, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ExportButtonsProps = {
  googleMapsUrl: string;
  wazeUrl: string;
};

export function ExportButtons({ googleMapsUrl, wazeUrl }: ExportButtonsProps) {
  const [copied, setCopied] = useState(false);
  const isValidUrl = /^https?:\/\/.+/i.test(googleMapsUrl);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(googleMapsUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <div className="flex flex-col gap-2">
      {isValidUrl ? (
        <Button asChild className="justify-start gap-2.5">
          <a href={googleMapsUrl} target="_blank" rel="noreferrer">
            <MapPin className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left">Open in Google Maps</span>
            <span className="text-xs opacity-50">↗</span>
          </a>
        </Button>
      ) : (
        <Button className="justify-start gap-2.5" disabled>
          <MapPin className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">Open in Google Maps</span>
        </Button>
      )}

      <Button asChild variant="secondary" className="justify-start gap-2.5">
        <a href={wazeUrl} target="_blank" rel="noreferrer">
          <Zap className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">Open in Waze</span>
          <span className="text-xs opacity-50">↗</span>
        </a>
      </Button>

      <Button
        variant={copied ? "success" : "ghost"}
        className={cn("justify-start gap-2.5")}
        disabled={!isValidUrl}
        onClick={handleCopy}
      >
        {copied ? <Check className="h-4 w-4 shrink-0" /> : <Copy className="h-4 w-4 shrink-0" />}
        <span className="flex-1 text-left">{copied ? "Copied ✓" : "Copy Link"}</span>
        {!copied && <span className="font-mono text-[10.5px] opacity-40">⌘L</span>}
      </Button>
    </div>
  );
}
