import type { AppraisalResult } from '../../types';
import type { PiddrInputs, PiddrSectionState } from '../../hooks/usePiddrReport';
import { formatCurrencyShort, formatMultiple } from '../../utils/format';

interface Props {
  section: PiddrSectionState<AppraisalResult>;
  inputs: PiddrInputs;
}

function SectionSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-stone-100 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function SectionError({ message }: { message: string }) {
  return (
    <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-[#FAFAF9] rounded-xl border border-[#D8D5D0]/60 px-4 py-3 text-center">
      <p className="text-[10px] uppercase tracking-wider text-[#7A756E] font-medium">{label}</p>
      <p className={`text-lg font-heading font-semibold mt-1 ${accent ? 'text-[#ED202B]' : 'text-[#201F1E]'}`}>
        {value}
      </p>
    </div>
  );
}

export default function LandValuationSection({ section, inputs }: Props) {
  const { loading, error, data } = section;

  return (
    <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="h-8 w-8 rounded-lg bg-[#ED202B]/10 flex items-center justify-center">
          <svg className="h-4 w-4 text-[#ED202B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 1v22m-5-4h7a4 4 0 004-4 4 4 0 00-4-4H9a4 4 0 01-4-4 4 4 0 014-4h7" />
          </svg>
        </div>
        <h2 className="font-heading text-base font-semibold text-[#201F1E]">
          Land Valuation
        </h2>
      </div>

      {loading && <SectionSkeleton />}
      {error && <SectionError message={error} />}

      {data && (
        <div className="space-y-5">
          {/* Metric cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard
              label="Current Value (Low)"
              value={data.currentValueLow > 0 ? formatCurrencyShort(data.currentValueLow) : '--'}
            />
            <MetricCard
              label="Current Value (High)"
              value={data.currentValueHigh > 0 ? formatCurrencyShort(data.currentValueHigh) : '--'}
            />
            <MetricCard
              label="Energized Value"
              value={formatCurrencyShort(data.energizedValue)}
              accent
            />
            <MetricCard
              label="Return Multiple"
              value={data.returnMultiple > 0 ? formatMultiple(data.returnMultiple) : '--'}
            />
          </div>

          {/* Detail rows */}
          <div className="border-t border-[#D8D5D0]/60 pt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-[#7A756E]">Acreage</span>
              <span className="text-[#201F1E] font-medium">
                {inputs.acreage > 0 ? `${inputs.acreage.toLocaleString()} acres` : '--'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#7A756E]">Price Per Acre (Range)</span>
              <span className="text-[#201F1E] font-medium">
                {inputs.ppaLow > 0 || inputs.ppaHigh > 0
                  ? `$${inputs.ppaLow.toLocaleString()} - $${inputs.ppaHigh.toLocaleString()}`
                  : '--'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#7A756E]">MW Capacity</span>
              <span className="text-[#201F1E] font-medium">{inputs.mw} MW</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#7A756E]">Value Created</span>
              <span className="text-[#ED202B] font-semibold">
                {data.valueCreated > 0 ? `+${formatCurrencyShort(data.valueCreated)}` : formatCurrencyShort(data.valueCreated)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
