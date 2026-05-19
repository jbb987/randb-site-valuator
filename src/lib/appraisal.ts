import type { AppraisalResult } from '../types';

/** Energized $/MW assumption used across appraisal calculations. */
export const VALUE_PER_MW = 3_000_000;

export interface AppraisalInputs {
  acreage: number;
  mw: number;
  ppaLow: number;
  ppaHigh: number;
}

/** Pure financial appraisal. Same math the Site Analyzer runs in its
 *  Land Valuation section; lives in a shared module so the Pre-Construction
 *  tool can call it without going through the Site Analyzer's React hook. */
export function computeAppraisal(input: AppraisalInputs): AppraisalResult {
  const currentValueLow = input.acreage * input.ppaLow;
  const currentValueHigh = input.acreage * input.ppaHigh;
  const currentValueMid = (currentValueLow + currentValueHigh) / 2;
  const energizedValue = input.mw * VALUE_PER_MW;
  const valueCreated = energizedValue - currentValueMid;
  const returnMultiple = currentValueMid > 0 ? energizedValue / currentValueMid : 0;

  return {
    currentValueLow,
    currentValueHigh,
    energizedValue,
    valueCreated,
    returnMultiple,
  };
}
