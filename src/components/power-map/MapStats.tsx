interface MapStatsProps {
  totalPlants: number;
  totalGenerationMW: number;
  totalSubstations: number;
  totalLines: number;
  totalAvailableMW: number;
  subsRed: number;
  subsBlue: number;
  subsGreen: number;
  loading: boolean;
}

function formatMW(mw: number): string {
  if (mw >= 1000) return `${(mw / 1000).toFixed(1)} GW`;
  return `${mw.toLocaleString()} MW`;
}

export default function MapStats({
  totalPlants,
  totalGenerationMW,
  totalSubstations,
  totalLines,
  totalAvailableMW,
  subsRed,
  subsBlue,
  subsGreen,
  loading,
}: MapStatsProps) {
  const stats = [
    { label: 'Generators', value: totalPlants.toLocaleString() },
    { label: 'Generation', value: formatMW(totalGenerationMW) },
    { label: 'Substations', value: totalSubstations.toLocaleString() },
    { label: 'Trans. Lines', value: totalLines.toLocaleString() },
    { label: 'Available', value: formatMW(totalAvailableMW) },
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-heading font-semibold text-sm text-[#201F1E]">Viewport Stats</h3>
        {loading && (
          <div className="w-4 h-4 border-2 border-[#ED202B]/30 border-t-[#ED202B] rounded-full animate-spin" />
        )}
      </div>
      <div className="space-y-2">
        {stats.map((stat) => (
          <div key={stat.label} className="flex items-center justify-between">
            <span className="text-sm text-[#7A756E]">{stat.label}</span>
            <span className="text-sm font-medium text-[#201F1E] tabular-nums">{stat.value}</span>
          </div>
        ))}
      </div>

      {/* Per-color substation breakdown */}
      {totalSubstations > 0 && (
        <>
          <hr className="border-[#D8D5D0] my-3" />
          <h4 className="text-xs font-medium text-[#7A756E] mb-2 uppercase tracking-wide">
            Substations by Capacity
          </h4>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm">
                <span className="w-2.5 h-2.5 rounded-full bg-[#22C55E] inline-block" />
                200+ MW
              </span>
              <span className="text-sm font-semibold text-[#22C55E] tabular-nums">{subsGreen}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm">
                <span className="w-2.5 h-2.5 rounded-full bg-[#3B82F6] inline-block" />
                1–199 MW
              </span>
              <span className="text-sm font-semibold text-[#3B82F6] tabular-nums">{subsBlue}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm">
                <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444] inline-block" />
                No capacity
              </span>
              <span className="text-sm font-semibold text-[#EF4444] tabular-nums">{subsRed}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
