import type { GeneratedRouteStats } from "@/types/route";

type RouteStatsProps = {
  stats: GeneratedRouteStats;
};

export function RouteStats({ stats }: RouteStatsProps) {
  const tiles = [
    { value: stats.totalDistanceKm.toFixed(1), unit: "km",   label: "Total distance" },
    { value: String(Math.round(stats.totalDurationMinutes)), unit: "min",  label: "Est. duration" },
    { value: String(stats.avgSpeedKmh),                      unit: "km/h", label: "Avg speed" },
    { value: String(stats.waypointCount),                    unit: "stops",label: "Waypoints" },
  ];

  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        <span>Route summary</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border">
        {tiles.map((t) => (
          <div key={t.label} className="flex flex-col gap-1 bg-card p-3.5">
            <div className="flex items-baseline gap-1 font-mono text-[22px] font-medium leading-none text-primary">
              {t.value}
              <span className="text-[11px] font-normal tracking-wider text-muted-foreground">{t.unit}</span>
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {t.label}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2 font-mono text-[11.5px] text-muted-foreground">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
        Route loops back to dealership
      </div>
    </div>
  );
}
