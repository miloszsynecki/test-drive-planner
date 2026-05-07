import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { GeneratedRouteStats } from "@/types/route";

type RouteStatsProps = {
  stats: GeneratedRouteStats;
};

export function RouteStats({ stats }: RouteStatsProps) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Route Stats</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center justify-between"><span>Total distance</span><Badge>{stats.totalDistanceKm.toFixed(1)} km</Badge></div>
        <div className="flex items-center justify-between"><span>Estimated duration</span><Badge>{Math.round(stats.totalDurationMinutes)} minutes</Badge></div>
        <div className="flex items-center justify-between"><span>Waypoints</span><Badge>{stats.waypointCount}</Badge></div>
        <div className="flex items-center justify-between"><span>Avg speed used</span><Badge>{stats.avgSpeedKmh} km/h</Badge></div>
        <div className="flex items-center justify-between"><span>Duration error</span><Badge>{stats.durationErrorPct.toFixed(1)}%</Badge></div>
        <div className="flex items-center justify-between"><span>U-turn maneuvers</span><Badge>{stats.uturnCount}</Badge></div>
        <div className="flex items-center justify-between"><span>Road overlap</span><Badge>{(stats.overlapRatio * 100).toFixed(1)}%</Badge></div>
        <p className="text-xs text-muted-foreground">Route starts and ends at dealership</p>
      </CardContent>
    </Card>
  );
}
