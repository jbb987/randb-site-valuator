/**
 * Power Infrastructure Lookup via HIFLD ArcGIS FeatureServer + FEMA + NREL.
 *
 * All endpoints are public / no API key required.
 */

import type {
  NearbySubstation,
  NearbyLine,
  NearbyPowerPlant,
  FloodZoneInfo,
  SolarWindResource,
} from '../types';

// ── Result type ─────────────────────────────────────────────────────────────

export interface InfraResult {
  iso: string[];
  utilityTerritory: string[];
  tsp: string[];
  nearestPoiName: string;
  nearestPoiDistMi: number;
  nearbySubstations: NearbySubstation[];
  nearbyLines: NearbyLine[];
  nearbyPowerPlants: NearbyPowerPlant[];
  floodZone: FloodZoneInfo | null;
  solarWind: SolarWindResource | null;
}

// ── Endpoints ───────────────────────────────────────────────────────────────

const HIFLD =
  'https://services1.arcgis.com/Hp6G80Pky0om6HgA/arcgis/rest/services';

const LAYERS = {
  controlAreas: `${HIFLD}/Control_Areas/FeatureServer/0`,
  retailTerritories: `${HIFLD}/Electric_Retail_Service_Territories_2/FeatureServer/0`,
  planningAreas: `${HIFLD}/Electric_Planning_Areas/FeatureServer/0`,
  substations: `${HIFLD}/Electric_Substations/FeatureServer/0`,
  transmissionLines: `${HIFLD}/Electric_Power_Transmission_Lines/FeatureServer/0`,
  powerPlants: `${HIFLD}/Power_Plants/FeatureServer/0`,
} as const;

const GEOCODE_URL =
  'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates';

const FEMA_NFHL_URL =
  'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Flood_Hazard_Reduced_Set/FeatureServer/0';

const NREL_SOLAR_URL =
  'https://developer.nrel.gov/api/solar/solar_resource/v1.json';
const NREL_API_KEY = 'DEMO_KEY';

const SEARCH_RADIUS_METERS = 16_093; // ~10 miles

// ── Helpers ─────────────────────────────────────────────────────────────────

function haversineMi(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number }> {
  const url = `${GEOCODE_URL}?${new URLSearchParams({
    singleLine: address,
    outFields: 'Match_addr',
    maxLocations: '1',
    f: 'json',
  })}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocode request failed (${res.status})`);
  const data = await res.json();
  if (!data.candidates?.length) {
    throw new Error('Address could not be geocoded — check the address and try again.');
  }
  const { x: lng, y: lat } = data.candidates[0].location;
  return { lat, lng };
}

/**
 * Generic ArcGIS query helper. Builds the URL manually to avoid URLSearchParams
 * encoding issues with commas in geometry values.
 */
async function arcgisQuery(
  label: string,
  layerUrl: string,
  params: Record<string, string>,
): Promise<{ features: { attributes: Record<string, unknown> }[] } | null> {
  // Build query string manually to avoid double-encoding
  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const url = `${layerUrl}/query?${qs}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[Infra] ${label} HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    if (data.error) {
      console.warn(`[Infra] ${label} API error:`, data.error);
      return null;
    }
    console.log(`[Infra] ${label}: ${(data.features ?? []).length} feature(s)`);
    return data;
  } catch (err) {
    console.warn(`[Infra] ${label} fetch error:`, err);
    return null;
  }
}

// ── Query functions ─────────────────────────────────────────────────────────

/** Point-in-polygon → array of NAME values */
async function queryTerritory(label: string, layerUrl: string, lat: number, lng: number): Promise<string[]> {
  const data = await arcgisQuery(label, layerUrl, {
    where: '1=1',
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    spatialRel: 'esriSpatialRelIntersects',
    inSR: '4326',
    outFields: 'NAME',
    returnGeometry: 'false',
    f: 'json',
  });
  if (!data) return [];
  return (data.features ?? []).map((f) => String(f.attributes.NAME ?? '')).filter(Boolean);
}

/** Nearby substations within 10mi radius */
async function querySubstations(lat: number, lng: number): Promise<NearbySubstation[]> {
  const data = await arcgisQuery('Substations', LAYERS.substations, {
    where: '1=1',
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    spatialRel: 'esriSpatialRelIntersects',
    distance: String(SEARCH_RADIUS_METERS),
    units: 'esriSRUnit_Meter',
    inSR: '4326',
    outFields: 'NAME,OWNER,MAX_VOLT,MIN_VOLT,STATUS,LINES,LATITUDE,LONGITUDE',
    returnGeometry: 'false',
    f: 'json',
  });
  if (!data) return [];
  return (data.features ?? [])
    .map((f) => {
      const a = f.attributes;
      const sLat = Number(a.LATITUDE) || 0;
      const sLng = Number(a.LONGITUDE) || 0;
      return {
        name: String(a.NAME ?? ''),
        owner: String(a.OWNER ?? ''),
        maxVolt: Number(a.MAX_VOLT) || 0,
        minVolt: Number(a.MIN_VOLT) || 0,
        status: String(a.STATUS ?? ''),
        lines: Number(a.LINES) || 0,
        distanceMi: haversineMi(lat, lng, sLat, sLng),
        lat: sLat,
        lng: sLng,
      } satisfies NearbySubstation;
    })
    .sort((a, b) => a.distanceMi - b.distanceMi);
}

/** Nearby transmission lines within 10mi radius */
async function queryLines(lat: number, lng: number): Promise<NearbyLine[]> {
  const data = await arcgisQuery('Lines', LAYERS.transmissionLines, {
    where: '1=1',
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    spatialRel: 'esriSpatialRelIntersects',
    distance: String(SEARCH_RADIUS_METERS),
    units: 'esriSRUnit_Meter',
    inSR: '4326',
    outFields: 'OWNER,VOLTAGE,VOLT_CLASS,SUB_1,SUB_2,STATUS',
    returnGeometry: 'false',
    f: 'json',
    resultRecordCount: '50',
  });
  if (!data) return [];
  return (data.features ?? [])
    .map((f) => {
      const a = f.attributes;
      return {
        owner: String(a.OWNER ?? ''),
        voltage: Number(a.VOLTAGE) || 0,
        voltClass: String(a.VOLT_CLASS ?? ''),
        sub1: String(a.SUB_1 ?? ''),
        sub2: String(a.SUB_2 ?? ''),
        status: String(a.STATUS ?? ''),
      } satisfies NearbyLine;
    })
    .sort((a, b) => b.voltage - a.voltage);
}

/** Nearby power plants within 10mi radius */
async function queryPowerPlants(lat: number, lng: number): Promise<NearbyPowerPlant[]> {
  const data = await arcgisQuery('Power Plants', LAYERS.powerPlants, {
    where: '1=1',
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    spatialRel: 'esriSpatialRelIntersects',
    distance: String(SEARCH_RADIUS_METERS),
    units: 'esriSRUnit_Meter',
    inSR: '4326',
    outFields: 'PLANT_NAME,PRIMESOURC,INSTALL_MW,STATUS,OPERATOR,LATITUDE,LONGITUDE',
    returnGeometry: 'false',
    f: 'json',
  });
  if (!data) return [];
  return (data.features ?? [])
    .map((f) => {
      const a = f.attributes;
      const pLat = Number(a.LATITUDE) || 0;
      const pLng = Number(a.LONGITUDE) || 0;
      return {
        name: String(a.PLANT_NAME ?? ''),
        operator: String(a.OPERATOR ?? ''),
        primarySource: String(a.PRIMESOURC ?? ''),
        capacityMW: Number(a.INSTALL_MW) || 0,
        status: String(a.STATUS ?? ''),
        distanceMi: haversineMi(lat, lng, pLat, pLng),
      } satisfies NearbyPowerPlant;
    })
    .sort((a, b) => a.distanceMi - b.distanceMi);
}

/** FEMA flood zone (point-in-polygon) */
async function queryFloodZone(lat: number, lng: number): Promise<FloodZoneInfo | null> {
  const data = await arcgisQuery('FEMA', FEMA_NFHL_URL, {
    where: '1=1',
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    spatialRel: 'esriSpatialRelIntersects',
    inSR: '4326',
    outFields: '*',
    returnGeometry: 'false',
    f: 'json',
  });
  if (!data || (data.features ?? []).length === 0) return null;
  const a = data.features[0].attributes;
  console.log('[Infra] FEMA fields:', Object.keys(a));
  return {
    zone: String(a.FLD_ZONE ?? a.ZONE ?? ''),
    floodwayType: String(a.FLOODWAY ?? 'None'),
    panelNumber: String(a.ZONE_SUBTY ?? a.DFIRM_PAN ?? ''),
  };
}

/** NREL solar/wind resource */
async function querySolarWind(lat: number, lng: number): Promise<SolarWindResource | null> {
  try {
    const res = await fetch(
      `${NREL_SOLAR_URL}?${new URLSearchParams({ api_key: NREL_API_KEY, lat: String(lat), lon: String(lng) })}`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    const o = data.outputs;
    if (!o) return null;
    return {
      ghi: Number(o.avg_ghi?.annual) || 0,
      dni: Number(o.avg_dni?.annual) || 0,
      windSpeed: Number(o.avg_wind_speed?.annual) || 0,
      capacity: Number(o.avg_lat_tilt?.annual) || 0,
    };
  } catch {
    return null;
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

export interface LookupOptions {
  coordinates?: { lat: number; lng: number };
  address?: string;
}

export async function lookupInfrastructure(opts: LookupOptions): Promise<InfraResult> {
  let { lat, lng } = opts.coordinates ?? { lat: 0, lng: 0 };

  if (!opts.coordinates || (lat === 0 && lng === 0)) {
    if (!opts.address) throw new Error('Provide an address or coordinates.');
    ({ lat, lng } = await geocodeAddress(opts.address));
  }

  console.log(`[Infra] Running analysis for ${lat.toFixed(4)}, ${lng.toFixed(4)}`);

  const [iso, utilityTerritory, tsp, substations, lines, powerPlants, floodZone, solarWind] =
    await Promise.all([
      queryTerritory('ISO/RTO', LAYERS.controlAreas, lat, lng),
      queryTerritory('Utility', LAYERS.retailTerritories, lat, lng),
      queryTerritory('TSP', LAYERS.planningAreas, lat, lng),
      querySubstations(lat, lng),
      queryLines(lat, lng),
      queryPowerPlants(lat, lng),
      queryFloodZone(lat, lng),
      querySolarWind(lat, lng),
    ]);

  const nearest = substations[0];

  console.log('[Infra] Analysis complete:', {
    iso, utilityTerritory, tsp,
    substations: substations.length, lines: lines.length, powerPlants: powerPlants.length,
    floodZone: floodZone?.zone ?? 'none', solarWind: solarWind ? 'yes' : 'none',
  });

  return {
    iso, utilityTerritory, tsp,
    nearestPoiName: nearest?.name ?? '',
    nearestPoiDistMi: nearest?.distanceMi ?? 0,
    nearbySubstations: substations,
    nearbyLines: lines,
    nearbyPowerPlants: powerPlants,
    floodZone,
    solarWind,
  };
}
