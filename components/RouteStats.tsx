import type { GeneratedRouteStats } from "@/types/route";

type RouteStatsProps = {
  stats: GeneratedRouteStats;
};

export function RouteStats({ stats }: RouteStatsProps) {
  const tiles = [
    { value: stats.totalDistanceKm.toFixed(1), unit: "km", label: "Total distance" },
    { value: String(Math.round(stats.totalDurationMinutes)), unit: "min", label: "Est. duration" },
    { value: String(stats.avgSpeedKmh), unit: "km/h", label: "Avg speed" },
    { value: String(stats.waypointCount), unit: "stops", label: "Waypoints" },
  ];

  return (
    <div>
      <div className="panel-section-title" style={{ marginBottom: 10 }}>Route summary</div>
      <div className="stat-grid">
        {tiles.map((t) => (
          <div key={t.label} className="stat-tile">
            <div className="stat-value">
              {t.value}
              <span className="stat-unit">{t.unit}</span>
            </div>
            <div className="stat-label">{t.label}</div>
          </div>
        ))}
      </div>
      <div className="loop-note">
        <span className="loop-dot" />
        Route loops back to dealership
      </div>
    </div>
  );
}
