export function toUserRouteError(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes("address not found")) {
      return "Address could not be resolved. Please pick a full address from suggestions.";
    }
    if (message.includes("google maps not loaded")) {
      return "Google Maps is still loading. Please retry in a moment.";
    }
    if (message.includes("no route candidates") || message.includes("no route")) {
      return "No drivable loop found for this setup. Try a longer duration or a different route character.";
    }
  }

  return "Could not build a route. Try increasing the duration or changing the route type.";
}
