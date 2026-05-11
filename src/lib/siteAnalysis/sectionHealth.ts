import type { AnalysisSectionState } from '../../hooks/useSiteAnalysis';
import type { LockableSectionKey } from '../../types';

/**
 * Per-section "health" rolled up from both the orchestrator's top-level
 * `error` and any sub-section error fields buried inside `data`.
 *
 * The orchestrator's `section.error` is null when the underlying analyzer
 * (e.g. `analyzeWater`) returns a result, even if individual sub-fetches
 * inside that analyzer failed and stored their errors on the result
 * (`wetlandsError`, `floodZoneError`, etc.). That's how Babi saw a green +
 * locked Water tab even though wetlands had timed out — `report.water.error`
 * was null, so the auto-lock and status-dot logic both treated it as clean.
 *
 * Mapping into the existing `SectionTOC` 4-state vocabulary:
 *   pending  → 'pending'
 *   loading  → 'loading'
 *   clean    → 'done'
 *   partial  → 'error'   (rolls up to red — same vocabulary as fully failed)
 *   failed   → 'error'
 */
export type SectionHealth = 'pending' | 'loading' | 'clean' | 'partial' | 'failed';

export function getSectionHealth(
  key: LockableSectionKey,
  section: AnalysisSectionState<unknown>,
): SectionHealth {
  if (section.loading) return 'loading';
  if (section.error) return 'failed';
  if (!section.data) return 'pending';
  return hasSubErrors(key, section.data) ? 'partial' : 'clean';
}

/**
 * Knows the per-section sub-error field names. Power and Transport don't
 * expose any — fully failed runs surface as `section.error` instead.
 *
 * Field names verified against:
 *   src/lib/waterAnalysis.types.ts        (Water)
 *   src/lib/gasAnalysis.ts                (Gas)
 *   src/lib/laborAnalysis.ts              (Labor)
 *   src/lib/politicalRadar/types.ts       (Political — nested under .layers.federal.data)
 *   src/types/index.ts                    (Broadband)
 */
function hasSubErrors(key: LockableSectionKey, data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  switch (key) {
    case 'water':
      return !!(
        d.floodZoneError ||
        d.streamError ||
        d.wetlandsError ||
        d.groundwaterError ||
        d.droughtError ||
        d.dischargePermitsError ||
        d.precipitationError
      );
    case 'broadband':
      return !!(d.providersError || d.fiberError);
    case 'gas':
      return !!(d.pipelineError || d.pricingError);
    case 'labor':
      return !!(d.acsError || d.qcewError || d.oewsError || d.lausError);
    case 'political': {
      const fed = (d.layers as Record<string, unknown> | undefined)?.federal as
        | Record<string, unknown>
        | undefined;
      const fedData = fed?.data as Record<string, unknown> | undefined;
      return !!(
        fedData?.billsError ||
        fedData?.eosError ||
        fedData?.repsError ||
        fedData?.tribalError
      );
    }
    case 'power':
    case 'transport':
      return false;
  }
}
