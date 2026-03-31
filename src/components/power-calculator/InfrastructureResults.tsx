import type {
  NearbySubstation,
  NearbyLine,
  NearbyPowerPlant,
  FloodZoneInfo,
  SolarWindResource,
  ElectricityPrice,
} from '../../types';
import TerritorySection from './TerritorySection';
import PoiSection from './PoiSection';
import SubstationsTable from './SubstationsTable';
import TransmissionLinesTable from './TransmissionLinesTable';
import PowerPlantsTable from './PowerPlantsTable';
import SolarResourceWidget from '../appraiser/SolarResourceWidget';
import ElectricityPriceWidget from '../appraiser/ElectricityPriceWidget';

export interface InfrastructureData {
  iso: string;
  utilityTerritory: string;
  tsp: string;
  nearestPoiName: string;
  nearestPoiDistMi: number;
  nearbySubstations: NearbySubstation[];
  nearbyLines: NearbyLine[];
  nearbyPowerPlants: NearbyPowerPlant[];
  floodZone: FloodZoneInfo | null;
  solarWind: SolarWindResource | null;
  electricityPrice: ElectricityPrice | null;
  detectedState: string | null;
  lastAnalyzedAt: number | null;
}

interface Props {
  data: InfrastructureData;
  loading: boolean;
  hasRunAnalysis: boolean;
}

export default function InfrastructureResults({ data, loading, hasRunAnalysis }: Props) {
  const hasAnalysisData =
    hasRunAnalysis ||
    data.nearbySubstations?.length > 0 ||
    data.nearbyLines?.length > 0 ||
    data.nearbyPowerPlants?.length > 0 ||
    data.floodZone != null ||
    data.solarWind != null;

  return (
    <div>
      {/* Territory */}
      <TerritorySection
        iso={data.iso}
        utilityTerritory={data.utilityTerritory}
        tsp={data.tsp}
      />

      {/* Nearest POI */}
      {(data.nearestPoiName || hasRunAnalysis) && (
        <PoiSection
          nearestPoiName={data.nearestPoiName}
          nearestPoiDistMi={data.nearestPoiDistMi}
        />
      )}

      {/* Analysis results */}
      {hasAnalysisData && (
        <>
          <SubstationsTable
            substations={data.nearbySubstations ?? []}
            hasRunAnalysis={hasRunAnalysis}
          />

          <TransmissionLinesTable
            lines={data.nearbyLines ?? []}
            hasRunAnalysis={hasRunAnalysis}
          />

          <PowerPlantsTable
            plants={data.nearbyPowerPlants ?? []}
            hasRunAnalysis={hasRunAnalysis}
          />

          {/* Flood Zone */}
          {data.floodZone && (
            <div className="mt-6">
              <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-[#201F1E] mb-3">
                FEMA Flood Zone
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-xs text-[#7A756E]">Zone</span>
                  <span className={`text-sm font-medium ${
                    data.floodZone.zone === 'X' || data.floodZone.zone === 'C'
                      ? 'text-green-700'
                      : data.floodZone.zone === 'D'
                        ? 'text-amber-600'
                        : 'text-red-600'
                  }`}>
                    {data.floodZone.zone}
                    {data.floodZone.zone === 'X' && ' (Minimal risk)'}
                    {data.floodZone.zone === 'A' && ' (High risk)'}
                    {data.floodZone.zone === 'AE' && ' (High risk)'}
                    {data.floodZone.zone === 'D' && ' (Undetermined)'}
                  </span>
                </div>
                {data.floodZone.floodwayType && data.floodZone.floodwayType !== 'None' && (
                  <div className="flex justify-between">
                    <span className="text-xs text-[#7A756E]">Floodway</span>
                    <span className="text-sm text-[#201F1E]">{data.floodZone.floodwayType}</span>
                  </div>
                )}
                {data.floodZone.panelNumber && (
                  <div className="flex justify-between">
                    <span className="text-xs text-[#7A756E]">DFIRM Panel</span>
                    <span className="text-sm text-[#201F1E]">{data.floodZone.panelNumber}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Solar Resource Widget */}
          {(data.solarWind || loading) && (
            <div className="mt-6">
              <SolarResourceWidget
                solarWind={data.solarWind}
                detectedState={data.detectedState ?? null}
                loading={loading}
              />
            </div>
          )}

          {/* Electricity Price Widget */}
          {(data.detectedState || loading) && (
            <div className="mt-6">
              <ElectricityPriceWidget
                electricityPrice={data.electricityPrice ?? null}
                detectedState={data.detectedState ?? null}
                loading={loading}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
