import type { LatLng } from "@/types/route";

export function buildExportUrls(
  dealershipAddress: string,
  dealershipLatLng: LatLng,
  waypoints: LatLng[],
): { googleMapsUrl: string; wazeUrl: string } {
  const encodedAddress = encodeURIComponent(dealershipAddress);
  const waypointString = waypoints.map((w) => `${w.lat},${w.lng}`).join("|");

  const googleMapsUrl =
    `https://www.google.com/maps/dir/?api=1&origin=${encodedAddress}` +
    `&destination=${encodedAddress}` +
    `&waypoints=${encodeURIComponent(waypointString)}` +
    "&travelmode=driving";

  // Waze navigates to the dealership; waypoints aren't supported in Waze deep links
  const wazeUrl = `https://waze.com/ul?ll=${dealershipLatLng.lat},${dealershipLatLng.lng}&navigate=yes`;

  return { googleMapsUrl, wazeUrl };
}
