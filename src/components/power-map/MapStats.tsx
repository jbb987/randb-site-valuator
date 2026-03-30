import { STATUS_COLORS } from '../../lib/powerMapData';

interface StatusCounts {
  activeSubs: number;
  plannedSubs: number;
  retiredSubs: number;
  activeLines: number;
  plannedLines: number;
  retiredLines: number;
  activePlants: number;
  plannedPlants: number;
  retiredPlants: number;
}

interface MapStatsProps {
  totalPlants: number;
  totalCapacityMW: number;
  totalDemandMW: number;
  totalSubstations: number;
  totalLines: number;
  loading: boolean;
  statusCounts: StatusCounts;
}

function formatMW(mw: number): string {
  if (mw >= 1000) return `${(mw / 1000).toFixed(1)} GW`;
  return `${mw.toLocaleString()} MW`;
}

function StatusBadge({ active, planned, retired }: { active: number; planned: number; retired: number }) {
  return (
    <span className="flex items-center gap-1.5 text-[10px] tabular-nums">
      <span style={{ color: STATUS_COLORS.active }}>{active}</span>
      {planned > 0 && (
        <span style={{ color: STATUS_COLORS.planned }}>{planned}</span>
      )}
      {retired > 0 && (
        <span style={{ color: STATUS_COLORS.retired }}>{retired}</span>
      )}
    </span>
  );
}

export default function MapStats({
  totalPlants,
  totalCapacityMW,
  totalDemandMW,
  totalSubstations,
  totalLines,
  loading,
  statusCounts,
}: MapStatsProps) {
  const stats = [
    {
      label: 'Generators',
      value: totalPlants.toLocaleString(),
      badge: <StatusBadge active={statusCounts.activePlants} planned={statusCounts.plannedPlants} retired={statusCounts.retiredPlants} />,
    },
    { label: 'Installed Cap.', value: formatMW(totalCapacityMW) },
    { label: 'Avg. Demand', value: formatMW(totalDemandMW) },
    {
      label: 'Substations',
      value: totalSubstations.toLocaleString(),
      badge: <StatusBadge active={statusCounts.activeSubs} planned={statusCounts.plannedSubs} retired={statusCounts.retiredSubs} />,
    },
    {
      label: 'Trans. Lines',
      value: totalLines.toLocaleString(),
      badge: <StatusBadge active={statusCounts.activeLines} planned={statusCounts.plannedLines} retired={statusCounts.retiredLines} />,
    },
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-heading font-semibold text-sm text-[#201F1E]">State Overview</h3>
        {loading && (
          <div className="w-4 h-4 border-2 border-[#ED202B]/30 border-t-[#ED202B] rounded-full animate-spin" />
        )}
      </div>
      <div className="space-y-2">
        {stats.map((stat) => (
          <div key={stat.label}>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#7A756E]">{stat.label}</span>
              <span className="text-sm font-medium text-[#201F1E] tabular-nums">{stat.value}</span>
            </div>
            {'badge' in stat && stat.badge && (
              <div className="flex justify-end mt-0.5">{stat.badge}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
