import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { GeneratedRouteStats } from "@/types/route";

type RouteStatsProps = {
  stats: GeneratedRouteStats;
};

export function RouteStats({ stats }: RouteStatsProps) {
  const quality = (() => {
    if (stats.uturnCount === 0 && stats.durationErrorPct <= 10 && stats.overlapRatio <= 0.14) {
      return { grade: "A", reason: "Excellent duration match, no U-turns, low overlap." };
    }
    if (stats.uturnCount <= 1 && stats.durationErrorPct <= 18 && stats.overlapRatio <= 0.22) {
      return { grade: "B", reason: "Good route quality with minor trade-offs." };
    }
    return { grade: "C", reason: "Usable route, but consider regenerating for better quality." };
  })();

  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Route Stats</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="rounded-md border bg-muted/50 p-3">
          <div className="flex items-center justify-between">
            <span className="font-medium">Route quality</span>
            <Badge>{quality.grade}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{quality.reason}</p>
        </div>
        <div className="flex items-center justify-between"><span>Total distance</span><Badge>{stats.totalDistanceKm.toFixed(1)} km</Badge></div>
        <div className="flex items-center justify-between"><span>Estimated duration</span><Badge>{Math.round(stats.totalDurationMinutes)} minutes</Badge></div>
        <div className="flex items-center justify-between"><span>Waypoints</span><Badge>{stats.waypointCount}</Badge></div>
        <div className="flex items-center justify-between"><span>Avg speed used</span><Badge>{stats.avgSpeedKmh} km/h</Badge></div>
        <div className="flex items-center justify-between"><span>Duration error</span><Badge>{stats.durationErrorPct.toFixed(1)}%</Badge></div>
        <div className="flex items-center justify-between"><span>U-turn maneuvers</span><Badge>{stats.uturnCount}</Badge></div>
        <div className="flex items-center justify-between"><span>Road overlap</span><Badge>{(stats.overlapRatio * 100).toFixed(1)}%</Badge></div>
        <div className="flex items-center justify-between"><span>Fallback level</span><Badge>{stats.fallbackLevel}</Badge></div>
        <div className="flex items-center justify-between"><span>U-turn fallback used</span><Badge>{stats.usedUTurnFallback ? "yes" : "no"}</Badge></div>
        <p className="text-xs text-muted-foreground">Route starts and ends at dealership</p>
      </CardContent>
    </Card>
  );
}
