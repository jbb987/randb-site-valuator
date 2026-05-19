import type {
  AppraisalResult,
  PreConGrade,
  PreConLoaStatus,
  PreConLoaStep,
  PreConSite,
  PreConUtility,
} from '../types';

/** Auto-suggest a grade from appraisal financial metrics.
 *
 *  Thresholds on `returnMultiple` (energizedValue / mid currentValue):
 *    ≥ 3   → 'go'             — strong upside
 *    1.5–3 → 'conditional-go' — viable but tight
 *    < 1.5 → 'no-go'          — not worth pursuing
 *
 *  Returns undefined if the appraisal hasn't produced a meaningful multiple
 *  (e.g. acreage/ppa not yet entered). The user can always override. */
export function suggestGradeFromAppraisal(appraisal: AppraisalResult | null | undefined):
  | PreConGrade
  | undefined {
  if (!appraisal) return undefined;
  const m = appraisal.returnMultiple;
  if (!Number.isFinite(m) || m <= 0) return undefined;
  if (m >= 3) return 'go';
  if (m >= 1.5) return 'conditional-go';
  return 'no-go';
}

/** Ordered list of LOA timeline steps for the v1 generic template. Each
 *  utility key maps to this same array today; per-utility overrides drop in
 *  here later without touching call sites. */
const GENERIC_LOA_TIMELINE: PreConLoaStatus[] = [
  'not-started',
  'contact-utility',
  'project-manager',
  'engineer-packet',
  'packet-to-ercot',
  'letter-of-allocation',
];

export const LOA_TIMELINES: Record<PreConUtility, PreConLoaStatus[]> = {
  oncor: GENERIC_LOA_TIMELINE,
  aep: GENERIC_LOA_TIMELINE,
  coop: GENERIC_LOA_TIMELINE,
  other: GENERIC_LOA_TIMELINE,
};

/** Resolve the timeline for a site. Falls back to the generic timeline when
 *  no utility has been selected yet. */
export function timelineForUtility(utility: PreConUtility | undefined): PreConLoaStatus[] {
  if (!utility) return GENERIC_LOA_TIMELINE;
  return LOA_TIMELINES[utility] ?? GENERIC_LOA_TIMELINE;
}

/** Append a step to the audit trail. Pure — returns a new array, doesn't
 *  touch Firestore. The caller writes the result back via updatePreConSite. */
export function appendLoaStep(
  site: Pick<PreConSite, 'loaSteps'>,
  status: PreConLoaStatus,
  userId: string,
): PreConLoaStep[] {
  return [
    ...site.loaSteps,
    {
      status,
      enteredAt: Date.now(),
      enteredBy: userId,
    },
  ];
}
