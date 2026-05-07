"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { AddressInput } from "@/components/AddressInput";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { LatLng, RouteCharacter } from "@/types/route";

type RouteFormProps = {
  loading: boolean;
  onSubmit: (input: {
    address: string;
    latLng: LatLng | null;
    durationMinutes: number;
    routeCharacter: RouteCharacter;
  }) => Promise<void> | void;
};

export function RouteForm({ loading, onSubmit }: RouteFormProps) {
  const [address, setAddress] = useState("");
  const [selectedLatLng, setSelectedLatLng] = useState<LatLng | null>(null);
  const [durationMinutes, setDurationMinutes] = useState("20");
  const [routeCharacter, setRouteCharacter] = useState<RouteCharacter>("mixed");
  const [addressError, setAddressError] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Test Drive Route Planner</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!address.trim()) {
              setAddressError("Address not found. Try a more specific address.");
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
          <div className="space-y-2">
            <Label>Dealership Address</Label>
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
            <p className="text-xs text-muted-foreground">
              Paste full address or pick one from suggestions.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Test Drive Duration</Label>
            <Select value={durationMinutes} onValueChange={setDurationMinutes}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{[15, 20, 30, 45, 60].map((m) => <SelectItem key={m} value={String(m)}>{m} minutes</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Route Character</Label>
            <Select value={routeCharacter} onValueChange={(v) => setRouteCharacter(v as RouteCharacter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="city">City Streets</SelectItem>
                <SelectItem value="mixed">Mixed</SelectItem>
                <SelectItem value="highway">Highway Taste</SelectItem>
                <SelectItem value="scenic">Scenic/Winding</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Finding best route...</> : "Generate Route"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
