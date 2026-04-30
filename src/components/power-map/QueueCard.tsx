import { useQueueLoad } from '../../hooks/useQueueLoad';
import type { QueueFuel, QueueIso } from '../../types';

const FUEL_LABEL: Record<QueueFuel, string> = {
  SOLAR: 'Solar', WIND: 'Wind', STORAGE: 'Storage', HYBRID: 'Hybrid',
  GAS: 'Gas', NUCLEAR: 'Nuclear', HYDRO: 'Hydro', COAL: 'Coal',
  BIOMASS: 'Biomass', OIL: 'Oil', GEOTHERMAL: 'Geothermal', OTHER: 'Other',
};

const ISO_LABEL: Record<QueueIso, string> = {
  PJM: 'PJM', MISO: 'MISO', ERCOT: 'ERCOT', SPP: 'SPP',
  CAISO: 'CAISO', NYISO: 'NYISO', ISONE: 'ISO-NE',
};

const fmtMW = (mw: number) => `${Math.round(mw).toLocaleString()} MW`;
const fmtCodYear = (iso: string | null) => (iso ? iso.slice(0, 4) : '—');

/** Format a (count, MW) pair. When count rounds to 0 but MW > 0, the load is
 * an apportioned share of a project that touches multiple substations — show
 * just the MW. When both are negligible, returns null (caller should hide). */
function rowText(count: number, mw: number): string | null {
  const c = Math.round(count);
  const m = Math.round(mw);
  if (c === 0 && m === 0) return null;
  if (c === 0) return `${m.toLocaleString()} MW (partial)`;
  return `${c.toLocaleString()} ${c === 1 ? 'project' : 'projects'} · ${m.toLocaleString()} MW`;
}

interface QueueCardProps {
  hifldId: number | null | undefined;
}

export default function QueueCard({ hifldId }: QueueCardProps) {
  const { data, loading, error } = useQueueLoad(hifldId);

  if (hifldId == null) return null;

  if (loading) {
    return (
      <div className="pt-2 mt-1 border-t border-[#D8D5D0]">
        <div className="text-[10px] uppercase tracking-wide text-[#7A756E] mb-1">Interconnection queue</div>
        <div className="text-xs text-[#7A756E]">Loading…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pt-2 mt-1 border-t border-[#D8D5D0]">
        <div className="text-[10px] uppercase tracking-wide text-[#7A756E] mb-1">Interconnection queue</div>
        <div className="text-xs text-[#7A756E]">Could not load queue data.</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="pt-2 mt-1 border-t border-[#D8D5D0]">
        <div className="text-[10px] uppercase tracking-wide text-[#7A756E] mb-1">Interconnection queue</div>
        <div className="text-xs text-[#7A756E]">No queue activity.</div>
      </div>
    );
  }

  const wdRate = data.withdrawal_rate_5y;
  const medianYears = data.median_time_to_cod_days != null
    ? `${(data.median_time_to_cod_days / 365).toFixed(1)} yrs`
    : null;

  return (
    <div className="pt-2 mt-1 border-t border-[#D8D5D0]">
      <div className="text-[10px] uppercase tracking-wide text-[#7A756E] mb-1.5">
        Interconnection queue · {ISO_LABEL[data.iso]}
      </div>

      <div className="space-y-1 text-xs">
        {(() => {
          const t = rowText(data.active_count, data.active_mw);
          return t ? (
            <div className="flex justify-between">
              <span className="text-[#7A756E]">Active</span>
              <span className="font-medium text-[#201F1E]">{t}</span>
            </div>
          ) : null;
        })()}
        {(() => {
          const t = rowText(data.withdrawn_count_5y, data.withdrawn_mw_5y);
          return t ? (
            <div className="flex justify-between">
              <span className="text-[#7A756E]">Withdrawn (5y)</span>
              <span className="font-medium text-[#201F1E]">{t}</span>
            </div>
          ) : null;
        })()}
        {(() => {
          const t = rowText(data.in_service_count, data.in_service_mw);
          return t ? (
            <div className="flex justify-between">
              <span className="text-[#7A756E]">In service</span>
              <span className="font-medium text-[#201F1E]">{t}</span>
            </div>
          ) : null;
        })()}

        {wdRate != null && (
          <div className="flex justify-between">
            <span className="text-[#7A756E]">Withdrawal rate (5y)</span>
            <span
              className="font-semibold"
              style={{ color: wdRate >= 0.5 ? '#EF4444' : wdRate >= 0.25 ? '#F97316' : '#3B82F6' }}
            >
              {Math.round(wdRate * 100)}%
            </span>
          </div>
        )}

        {medianYears && (
          <div className="flex justify-between">
            <span className="text-[#7A756E]">Median time to COD</span>
            <span className="font-medium text-[#201F1E]">
              {medianYears}
              <span className="text-[#7A756E] ml-1">(n={data.completed_sample_size})</span>
            </span>
          </div>
        )}

        {data.earliest_active_cod && (
          <div className="flex justify-between">
            <span className="text-[#7A756E]">Earliest active COD</span>
            <span className="font-medium text-[#201F1E]">{fmtCodYear(data.earliest_active_cod)}</span>
          </div>
        )}
      </div>

      {data.top_active.length > 0 && (
        <div className="mt-2 pt-2 border-t border-[#D8D5D0]/60">
          <div className="text-[10px] uppercase tracking-wide text-[#7A756E] mb-1">Top active projects</div>
          <ul className="space-y-0.5 text-xs">
            {data.top_active.slice(0, 3).map((p, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span className="text-[#201F1E] truncate">{p.name || 'Unnamed'}</span>
                <span className="text-[#7A756E] shrink-0">
                  {fmtMW(p.mw)} · {FUEL_LABEL[p.fuel]} · {fmtCodYear(p.cod)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
