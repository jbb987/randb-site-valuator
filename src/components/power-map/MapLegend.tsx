import { SOURCE_COLORS, AVAILABILITY_BINS } from '../../lib/powerMapData';

interface MapLegendProps {
  visibleSources: Set<string>;
  onToggleSource: (source: string) => void;
  showLines: boolean;
  onToggleLines: () => void;
  showSubstations: boolean;
  onToggleSubstations: () => void;
  showAvailability: boolean;
  onToggleAvailability: () => void;
}

export default function MapLegend({
  visibleSources,
  onToggleSource,
  showLines,
  onToggleLines,
  showSubstations,
  onToggleSubstations,
  showAvailability,
  onToggleAvailability,
}: MapLegendProps) {
  const sources = Object.entries(SOURCE_COLORS).filter(([key]) => key !== 'Other');

  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#D8D5D0] p-4 space-y-4">
      <h3 className="font-heading font-semibold text-sm text-[#201F1E]">Layers</h3>

      {/* Toggle layers */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={showLines}
            onChange={onToggleLines}
            className="accent-[#ED202B] w-3.5 h-3.5"
          />
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-[#F59E0B] inline-block" />
            Transmission Lines
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={showSubstations}
            onChange={onToggleSubstations}
            className="accent-[#ED202B] w-3.5 h-3.5"
          />
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-[#201F1E] inline-block border border-white" />
            Substations
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={showAvailability}
            onChange={onToggleAvailability}
            className="accent-[#ED202B] w-3.5 h-3.5"
          />
          <span className="flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded-full inline-block"
              style={{ background: 'linear-gradient(135deg, #3B82F6, #EF4444)' }}
            />
            Power Availability
          </span>
        </label>
      </div>

      <hr className="border-[#D8D5D0]" />

      {/* Generator sources */}
      <div>
        <h4 className="text-xs font-medium text-[#7A756E] mb-2 uppercase tracking-wide">
          Generator Sources
        </h4>
        <div className="space-y-1.5">
          {sources.map(([source, color]) => (
            <label key={source} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={visibleSources.has(source)}
                onChange={() => onToggleSource(source)}
                className="accent-[#ED202B] w-3.5 h-3.5"
              />
              <span
                className="w-3 h-3 rounded-full inline-block flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              {source}
            </label>
          ))}
        </div>
      </div>

      <hr className="border-[#D8D5D0]" />

      {/* Availability scale — discrete bins */}
      <div>
        <h4 className="text-xs font-medium text-[#7A756E] mb-2 uppercase tracking-wide">
          Availability Scale
        </h4>
        <div className="space-y-1">
          {AVAILABILITY_BINS.map(({ color, label }) => (
            <div key={label} className="flex items-center gap-2">
              <span
                className="w-4 h-3 rounded-sm inline-block flex-shrink-0"
                style={{ backgroundColor: color, opacity: 0.7 }}
              />
              <span className="text-xs text-[#7A756E]">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
