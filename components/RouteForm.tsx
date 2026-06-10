"use client";

import { useState } from "react";
import { Timer, Route, Maximize2, Layers, Loader2 } from "lucide-react";
import { AddressInput } from "@/components/AddressInput";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { LatLng, LoopSize, RouteCharacter, WaypointDensity } from "@/types/route";

export type RouteFormInput = {
  address: string;
  latLng: LatLng | null;
  durationMinutes: number;
  routeCharacter: RouteCharacter;
  loopSize: LoopSize;
  waypointDensity: WaypointDensity;
};

type RouteFormProps = {
  loading: boolean;
  loadingMessage?: string;
  onSubmit: (input: RouteFormInput) => Promise<void> | void;
};

function FieldLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Label className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
      {icon}
      {children}
    </Label>
  );
}

export function RouteForm({ loading, loadingMessage, onSubmit }: RouteFormProps) {
  const [address, setAddress] = useState("");
  const [selectedLatLng, setSelectedLatLng] = useState<LatLng | null>(null);
  const [durationMinutes, setDurationMinutes] = useState("20");
  const [routeCharacter, setRouteCharacter] = useState<RouteCharacter>("mixed");
  const [loopSize, setLoopSize] = useState<LoopSize>("standard");
  const [waypointDensity, setWaypointDensity] = useState<WaypointDensity>("detailed");
  const [addressError, setAddressError] = useState("");

  return (
    <Card>
      <CardHeader className="pb-2 pt-5 px-5">
        <CardTitle className="font-mono text-[10.5px] font-normal uppercase tracking-[0.14em] text-muted-foreground">
          Route parameters
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-5 pb-5">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!address.trim()) {
              setAddressError("Enter a dealership address to continue.");
              return;
            }
            setAddressError("");
            onSubmit({ address, latLng: selectedLatLng, durationMinutes: Number(durationMinutes), routeCharacter, loopSize, waypointDensity });
          }}
        >
          <div className="flex flex-col gap-1.5">
            <FieldLabel icon={null}>Dealership address</FieldLabel>
            <AddressInput
              value={address}
              onChange={(v) => { setAddress(v); setSelectedLatLng(null); }}
              onSelect={(_, latLng) => { setSelectedLatLng(latLng); setAddressError(""); }}
              error={addressError}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <FieldLabel icon={<Timer className="h-3 w-3" />}>Test drive duration</FieldLabel>
            <Select value={durationMinutes} onValueChange={setDurationMinutes}>
              <SelectTrigger className="h-11 bg-input">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[15, 20, 30, 45, 60].map((m) => (
                  <SelectItem key={m} value={String(m)}>{m} minutes</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <FieldLabel icon={<Route className="h-3 w-3" />}>Route character</FieldLabel>
            <Select value={routeCharacter} onValueChange={(v) => setRouteCharacter(v as RouteCharacter)}>
              <SelectTrigger className="h-11 bg-input">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="city">City Streets</SelectItem>
                <SelectItem value="mixed">Mixed</SelectItem>
                <SelectItem value="highway">Highway Taste</SelectItem>
                <SelectItem value="scenic">Scenic &amp; Winding</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <FieldLabel icon={<Maximize2 className="h-3 w-3" />}>Loop size</FieldLabel>
              <Select value={loopSize} onValueChange={(v) => setLoopSize(v as LoopSize)}>
                <SelectTrigger className="h-11 bg-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="compact">Compact</SelectItem>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="wide">Wide</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <FieldLabel icon={<Layers className="h-3 w-3" />}>Waypoint detail</FieldLabel>
              <Select value={waypointDensity} onValueChange={(v) => setWaypointDensity(v as WaypointDensity)}>
                <SelectTrigger className="h-11 bg-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="detailed">Detailed</SelectItem>
                  <SelectItem value="max">Maximum</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button type="submit" className="mt-1 w-full font-semibold" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {loadingMessage ?? "Finding best route..."}
              </>
            ) : (
              "Generate Route"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
