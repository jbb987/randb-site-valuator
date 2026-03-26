import { useState, useCallback, useRef } from 'react';
import {
  fetchPowerPlants,
  fetchTransmissionLines,
  calculateAvailability,
  type MapBounds,
  type MapPowerPlant,
  type MapTransmissionLine,
  type MapSubstation,
  type AvailabilityPoint,
} from '../lib/powerMapData';
import { US_AVG_PER_CAPITA_KW } from '../lib/eiaConsumption';
import { getStateBounds } from '../lib/stateBounds';

export interface PowerMapState {
  plants: MapPowerPlant[];
  lines: MapTransmissionLine[];
  substations: MapSubstation[];
  availability: AvailabilityPoint[];
  totalGenerationMW: number;
  totalAvailableMW: number;
  loading: boolean;
  error: string | null;
  selectedState: string | null;
  bounds: MapBounds | null;
}

interface CachedStateData {
  plants: MapPowerPlant[];
  lines: MapTransmissionLine[];
  substations: MapSubstation[];
  availability: AvailabilityPoint[];
  totalGenerationMW: number;
  totalAvailableMW: number;
}

export function usePowerMap() {
  const [state, setState] = useState<PowerMapState>({
    plants: [],
    lines: [],
    substations: [],
    availability: [],
    totalGenerationMW: 0,
    totalAvailableMW: 0,
    loading: false,
    error: null,
    selectedState: null,
    bounds: null,
  });

  const cacheRef = useRef<Map<string, CachedStateData>>(new Map());
  const requestIdRef = useRef(0);

  const loadState = useCallback(async (stateAbbr: string) => {
    const stateBounds = getStateBounds(stateAbbr);
    if (!stateBounds) return;

    // Check cache first
    const cached = cacheRef.current.get(stateAbbr);
    if (cached) {
      setState({
        ...cached,
        loading: false,
        error: null,
        selectedState: stateAbbr,
        bounds: {
          west: stateBounds.lngMin,
          south: stateBounds.latMin,
          east: stateBounds.lngMax,
          north: stateBounds.latMax,
        },
      });
      return;
    }

    const requestId = ++requestIdRef.current;
    setState((prev) => ({ ...prev, loading: true, error: null, selectedState: stateAbbr }));

    try {
      const bounds: MapBounds = {
        west: stateBounds.lngMin,
        south: stateBounds.latMin,
        east: stateBounds.lngMax,
        north: stateBounds.latMax,
      };

      // Fetch all data for the state — large limit since it's a one-time load
      const [plantsResult, linesResult] = await Promise.all([
        fetchPowerPlants(bounds, { maxResults: 5000 }),
        fetchTransmissionLines(bounds, { maxResults: 5000 }),
      ]);

      if (requestId !== requestIdRef.current) return;

      const plants = plantsResult.data;
      const { lines, substations } = linesResult.data;

      const availability = calculateAvailability(plants, substations, US_AVG_PER_CAPITA_KW);
      const totalGenerationMW = Math.round(plants.reduce((sum, p) => sum + p.capacityMW, 0));
      const totalAvailableMW = Math.round(availability.reduce((sum, a) => sum + a.availableMW, 0));

      const data: CachedStateData = {
        plants,
        lines,
        substations,
        availability,
        totalGenerationMW,
        totalAvailableMW,
      };

      // Cache the result
      cacheRef.current.set(stateAbbr, data);

      setState({
        ...data,
        loading: false,
        error: null,
        selectedState: stateAbbr,
        bounds,
      });
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load state data',
      }));
    }
  }, []);

  const clearState = useCallback(() => {
    setState({
      plants: [],
      lines: [],
      substations: [],
      availability: [],
      totalGenerationMW: 0,
      totalAvailableMW: 0,
      loading: false,
      error: null,
      selectedState: null,
      bounds: null,
    });
  }, []);

  return { ...state, loadState, clearState };
}
