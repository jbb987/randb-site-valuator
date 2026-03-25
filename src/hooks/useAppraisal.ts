import { useMemo } from 'react';
import type { SiteInputs, AppraisalResult } from '../types';

/** Energized value: $1M per MW */
const VALUE_PER_MW = 1_000_000;

export function useAppraisal(inputs: SiteInputs): AppraisalResult {
  return useMemo(() => {
    const currentValue = inputs.totalAcres * inputs.currentPPA;
    const energizedValue = inputs.mw * VALUE_PER_MW;
    const energizedPPA = inputs.totalAcres > 0 ? energizedValue / inputs.totalAcres : 0;
    const valueCreated = energizedValue - currentValue;
    const returnMultiple = currentValue > 0 ? energizedValue / currentValue : 0;

    return {
      currentValue,
      energizedValue,
      energizedPPA,
      valueCreated,
      returnMultiple,
    };
  }, [inputs.totalAcres, inputs.currentPPA, inputs.mw]);
}
