"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type ExportButtonsProps = {
  googleMapsUrl: string;
};

export function ExportButtons({ googleMapsUrl }: ExportButtonsProps) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const isValidUrl = /^https?:\/\/.+/i.test(googleMapsUrl);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {isValidUrl ? (
        <Button asChild variant="outline">
          <a href={googleMapsUrl} target="_blank" rel="noreferrer">Open in Google Maps</a>
        </Button>
      ) : (
        <Button variant="outline" disabled>Open in Google Maps</Button>
      )}
      <Button
        variant="outline"
        disabled={!isValidUrl}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(googleMapsUrl);
            setCopied(true);
            setCopyError("");
            setTimeout(() => setCopied(false), 2000);
          } catch {
            setCopyError("Could not copy the link. Please try again.");
          }
        }}
      >
        {copied ? "Copied!" : "Copy Link"}
      </Button>
      </div>
      {copyError ? <p className="text-xs text-destructive">{copyError}</p> : null}
      {!isValidUrl ? <p className="text-xs text-muted-foreground">Export link is unavailable for this route.</p> : null}
    </div>
  );
}
