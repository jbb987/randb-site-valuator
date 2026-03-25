import type { SiteInputs, AppraisalResult } from '../../types';
import { formatCurrencyShort } from '../../utils/format';
import { useInfraLookup } from '../../hooks/useInfraLookup';
import PresentationView from '../PresentationView';
import SiteMapCard from './SiteMapCard';

interface Props {
  inputs: SiteInputs;
  result: AppraisalResult;
  onMWChange: (mw: number) => void;
  onInputsChange: (inputs: SiteInputs) => void;
}

const inputClass =
  'w-full rounded-lg border border-[#D8D5D0] bg-white/80 px-3 py-2.5 text-sm text-[#201F1E] outline-none transition focus:border-[#C1121F]/40 focus:ring-2 focus:ring-[#C1121F]/10 placeholder:text-[#7A756E]';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-[#7A756E]">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-[#7A756E]">{hint}</span>}
    </label>
  );
}

export default function SiteDetailPanel({ inputs, result, onMWChange, onInputsChange }: Props) {
  const { loading: infraLoading, error: infraError, lookup: infraLookup } = useInfraLookup();

  function set<K extends keyof SiteInputs>(key: K, value: SiteInputs[K]) {
    onInputsChange({ ...inputs, [key]: value });
  }

  async function handleInfraLookup() {
    const result = await infraLookup({
      coordinates: inputs.coordinates,
      address: inputs.address,
    });
    if (result) {
      onInputsChange({
        ...inputs,
        iso: result.iso || inputs.iso,
        utilityTerritory: result.utilityTerritory || inputs.utilityTerritory,
        tsp: result.tsp || inputs.tsp,
      });
    }
  }

  function num(key: keyof SiteInputs, raw: string) {
    const n = parseFloat(raw);
    if (!isNaN(n)) set(key, n);
    if (raw === '') set(key, 0);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Calculator (existing PresentationView) */}
      <PresentationView
        inputs={inputs}
        result={result}
        onMWChange={onMWChange}
        onSiteNameChange={(name) => set('siteName', name)}
      />

      {/* Land / Property Details */}
      <div className="bg-white rounded-2xl border border-[#D8D5D0] p-6 md:p-8">
        <h3 className="font-heading text-sm font-semibold text-[#201F1E] mb-5">
          Land / Property
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Address">
            <input
              type="text"
              className={inputClass}
              value={inputs.address}
              onChange={(e) => set('address', e.target.value)}
              placeholder="123 Main St, Cheyenne, WY"
            />
          </Field>

          <Field label="Coordinates" hint="Latitude, Longitude">
            <input
              type="text"
              className={inputClass}
              value={inputs.coordinates}
              onChange={(e) => set('coordinates', e.target.value)}
              placeholder="41.1400, -104.8200"
            />
          </Field>

          <Field label="Prior Usage / Property Type">
            <input
              type="text"
              className={inputClass}
              value={inputs.priorUsage}
              onChange={(e) => set('priorUsage', e.target.value)}
              placeholder="e.g. Agricultural, Vacant, Ranch"
            />
          </Field>

          <Field label="Legal Description">
            <input
              type="text"
              className={inputClass}
              value={inputs.legalDescription}
              onChange={(e) => set('legalDescription', e.target.value)}
              placeholder="Lot 1, Block 2, Section 14"
            />
          </Field>

          <Field label="County">
            <input
              type="text"
              className={inputClass}
              value={inputs.county}
              onChange={(e) => set('county', e.target.value)}
              placeholder="Laramie County, WY"
            />
          </Field>

          <Field label="Acreage">
            <input
              type="number"
              className={inputClass}
              value={inputs.totalAcres || ''}
              onChange={(e) => num('totalAcres', e.target.value)}
              placeholder="414"
            />
          </Field>

          <Field label="Parcel ID">
            <input
              type="text"
              className={inputClass}
              value={inputs.parcelId}
              onChange={(e) => set('parcelId', e.target.value)}
              placeholder="00014006623014"
            />
          </Field>

          <Field label="Owner">
            <input
              type="text"
              className={inputClass}
              value={inputs.owner}
              onChange={(e) => set('owner', e.target.value)}
              placeholder="John Doe"
            />
          </Field>

          <Field label="$/Acre Low" hint="From land comps">
            <input
              type="number"
              className={inputClass}
              value={inputs.ppaLow || ''}
              onChange={(e) => num('ppaLow', e.target.value)}
              placeholder="5000"
            />
          </Field>

          <Field label="$/Acre High" hint="From land comps">
            <input
              type="number"
              className={inputClass}
              value={inputs.ppaHigh || ''}
              onChange={(e) => num('ppaHigh', e.target.value)}
              placeholder="8000"
            />
          </Field>

          <Field label="Raw Land Value" hint="Computed from acreage × $/acre">
            <div className="rounded-lg border border-[#D8D5D0] bg-[#F5F4F2] px-3 py-2.5 text-sm text-[#201F1E]">
              {result.currentValueLow > 0 || result.currentValueHigh > 0
                ? `Est. ${formatCurrencyShort(result.currentValueLow)} – ${formatCurrencyShort(result.currentValueHigh)}`
                : '—'}
            </div>
          </Field>

        </div>
      </div>

      {/* Power Infrastructure */}
      <div className="bg-white rounded-2xl border border-[#D8D5D0] p-6 md:p-8">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-heading text-sm font-semibold text-[#201F1E]">
            Power Infrastructure
          </h3>
          <button
            type="button"
            onClick={handleInfraLookup}
            disabled={infraLoading || (!inputs.address && !inputs.coordinates)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#C1121F] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#A10E1A] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {infraLoading ? (
              <>
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Looking up…
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
                </svg>
                Auto-fill from HIFLD
              </>
            )}
          </button>
        </div>

        {infraError && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
            {infraError}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="RTO / ISO">
            <input
              type="text"
              className={inputClass}
              value={inputs.iso}
              onChange={(e) => set('iso', e.target.value)}
              placeholder="e.g. WECC, SPP, ERCOT"
            />
          </Field>

          <Field label="Utility Territory">
            <input
              type="text"
              className={inputClass}
              value={inputs.utilityTerritory}
              onChange={(e) => set('utilityTerritory', e.target.value)}
              placeholder="e.g. PacifiCorp"
            />
          </Field>

          <Field label="Transmission Service Provider (TSP)">
            <input
              type="text"
              className={inputClass}
              value={inputs.tsp}
              onChange={(e) => set('tsp', e.target.value)}
              placeholder="e.g. Western Area Power"
            />
          </Field>
        </div>
      </div>

      {/* Site Location Map */}
      <SiteMapCard coordinates={inputs.coordinates} />
    </div>
  );
}
