"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type ExportButtonsProps = {
  googleMapsUrl: string;
};

export function ExportButtons({ googleMapsUrl }: ExportButtonsProps) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <Button asChild variant="outline"><a href={googleMapsUrl} target="_blank" rel="noreferrer">Open in Google Maps</a></Button>
      <Button
        variant="outline"
        onClick={async () => {
          await navigator.clipboard.writeText(googleMapsUrl);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? "Copied!" : "Copy Link"}
      </Button>
    </div>
  );
}
