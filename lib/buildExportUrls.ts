import type { LatLng } from "@/types/route";

export function buildExportUrls(
  dealershipAddress: string,
  _dealershipLatLng: LatLng,
  waypoints: LatLng[],
): { googleMapsUrl: string } {
  const encodedAddress = encodeURIComponent(dealershipAddress);
  const waypointString = waypoints.map((w) => `${w.lat},${w.lng}`).join("|");

  const googleMapsUrl =
    `https://www.google.com/maps/dir/?api=1&origin=${encodedAddress}` +
    `&destination=${encodedAddress}` +
    `&waypoints=${encodeURIComponent(waypointString)}` +
    "&travelmode=driving";

  return { googleMapsUrl };
}
