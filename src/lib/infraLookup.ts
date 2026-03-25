/**
 * Power Infrastructure Lookup via HIFLD ArcGIS FeatureServer + FEMA + NREL.
 *
 * Flow: address or coordinates → geocode (if needed) → 7 parallel queries
 * across 4 public data sources → full InfraResult.
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
}

// ── HIFLD layer endpoints ───────────────────────────────────────────────────

const HIFLD_BASE =
  'https://services1.arcgis.com/Hp6G80Pky0om6HgA/arcgis/rest/services';

const LAYERS = {
  controlAreas: `${HIFLD_BASE}/Control_Areas/FeatureServer/0`,
  retailTerritories: `${HIFLD_BASE}/Electric_Retail_Service_Territories_2/FeatureServer/0`,
  planningAreas: `${HIFLD_BASE}/Electric_Planning_Areas/FeatureServer/0`,
  substations: `${HIFLD_BASE}/Electric_Substations/FeatureServer/0`,
  transmissionLines: `${HIFLD_BASE}/Electric_Power_Transmission_Lines/FeatureServer/0`,
  powerPlants: `${HIFLD_BASE}/Power_Plants/FeatureServer/0`,
} as const;

// ── Other data sources ──────────────────────────────────────────────────────

const GEOCODE_URL =
  'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates';

const FEMA_NFHL_URL =
  'https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/28';

const NREL_SOLAR_URL =
  'https://developer.nrel.gov/api/solar/solar_resource/v1.json';

// NREL demo key — works for low-volume usage. Replace with your own for production.
const NREL_API_KEY = 'DEMO_KEY';

// 10-mile search radius in meters
const SEARCH_RADIUS_METERS = 16_093;

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Haversine distance in miles between two lat/lng points. */
function haversineMi(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Geocode an address string → { lat, lng }. */
export async function geocodeAddress(
  address: string,
): Promise<{ lat: number; lng: number }> {
  const params = new URLSearchParams({
    singleLine: address,
    outFields: 'Match_addr',
    maxLocations: '1',
    f: 'json',
  });

  const res = await fetch(`${GEOCODE_URL}?${params}`);
  if (!res.ok) throw new Error(`Geocode request failed (${res.status})`);

  const data = await res.json();
  const candidates = data.candidates;
  if (!candidates?.length) {
    throw new Error('Address could not be geocoded — check the address and try again.');
  }

  const { x: lng, y: lat } = candidates[0].location;
  return { lat, lng };
}

// ── Layer queries ───────────────────────────────────────────────────────────

/** Point-in-polygon query → NAME field. */
async function queryPolygonLayer(layerUrl: string, lat: number, lng: number): Promise<string> {
  const params = new URLSearchParams({
    where: '1=1',
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    spatialRel: 'esriSpatialRelIntersects',
    inSR: '4326',
    outFields: 'NAME',
    returnGeometry: 'false',
    f: 'json',
  });

  const res = await fetch(`${layerUrl}/query?${params}`);
  if (!res.ok) throw new Error(`HIFLD query failed (${res.status})`);

  const data = await res.json();
  const features: { attributes: { NAME: string } }[] = data.features ?? [];

  if (features.length === 0) return '';
  if (features.length === 1) return features[0].attributes.NAME;
  return features.map((f) => f.attributes.NAME).join(' / ');
}

/** Radius query for substations within ~10 miles. */
async function querySubstations(
  lat: number, lng: number,
): Promise<NearbySubstation[]> {
  const params = new URLSearchParams({
    where: '1=1',
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    distance: String(SEARCH_RADIUS_METERS),
    units: 'esriSRUnit_Meter',
    spatialRel: 'esriSpatialRelIntersects',
    inSR: '4326',
    outFields: 'NAME,OWNER,MAX_VOLT,MIN_VOLT,STATUS,LINES,LATITUDE,LONGITUDE',
    returnGeometry: 'false',
    f: 'json',
  });

  const url = `${LAYERS.substations}/query?${params}`;
  console.log('[Infra] Substations URL:', url);
  const res = await fetch(url);
  if (!res.ok) { console.warn('[Infra] Substations query failed:', res.status); return []; }

  const data = await res.json();
  console.log('[Infra] Substations response:', data);
  const features: { attributes: Record<string, unknown> }[] = data.features ?? [];

  return features
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

/** Radius query for transmission lines within ~10 miles. */
async function queryTransmissionLines(
  lat: number, lng: number,
): Promise<NearbyLine[]> {
  const params = new URLSearchParams({
    where: '1=1',
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    distance: String(SEARCH_RADIUS_METERS),
    units: 'esriSRUnit_Meter',
    spatialRel: 'esriSpatialRelIntersects',
    inSR: '4326',
    outFields: 'OWNER,VOLTAGE,VOLT_CLASS,SUB_1,SUB_2,STATUS',
    returnGeometry: 'false',
    f: 'json',
    resultRecordCount: '25',
  });

  const url = `${LAYERS.transmissionLines}/query?${params}`;
  console.log('[Infra] Lines URL:', url);
  const res = await fetch(url);
  if (!res.ok) { console.warn('[Infra] Lines query failed:', res.status); return []; }

  const data = await res.json();
  console.log('[Infra] Lines response:', data);
  const features: { attributes: Record<string, unknown> }[] = data.features ?? [];

  return features
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
    .sort((a, b) => b.voltage - a.voltage); // highest voltage first
}

/** Radius query for power plants within ~10 miles. */
async function queryPowerPlants(
  lat: number, lng: number,
): Promise<NearbyPowerPlant[]> {
  const params = new URLSearchParams({
    where: '1=1',
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    distance: String(SEARCH_RADIUS_METERS),
    units: 'esriSRUnit_Meter',
    spatialRel: 'esriSpatialRelIntersects',
    inSR: '4326',
    outFields: 'PLANT_NAME,PRIMESOURC,INSTALL_MW,STATUS,OPERATOR,LATITUDE,LONGITUDE',
    returnGeometry: 'false',
    f: 'json',
  });

  const url = `${LAYERS.powerPlants}/query?${params}`;
  console.log('[Infra] Power Plants URL:', url);
  const res = await fetch(url);
  if (!res.ok) { console.warn('[Infra] Power Plants query failed:', res.status); return []; }

  const data = await res.json();
  console.log('[Infra] Power Plants response:', data);
  const features: { attributes: Record<string, unknown> }[] = data.features ?? [];

  return features
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

/** FEMA flood zone query (point-in-polygon). */
async function queryFloodZone(
  lat: number, lng: number,
): Promise<FloodZoneInfo | null> {
  const params = new URLSearchParams({
    where: '1=1',
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    spatialRel: 'esriSpatialRelIntersects',
    inSR: '4326',
    outFields: 'FLD_ZONE,FLOODWAY,DFIRM_PAN',
    returnGeometry: 'false',
    f: 'json',
  });

  try {
    const url = `${FEMA_NFHL_URL}/query?${params}`;
    console.log('[Infra] FEMA URL:', url);
    const res = await fetch(url);
    if (!res.ok) { console.warn('[Infra] FEMA query failed:', res.status); return null; }

    const data = await res.json();
    console.log('[Infra] FEMA response:', data);
    const features: { attributes: Record<string, unknown> }[] = data.features ?? [];
    if (features.length === 0) return null;

    const a = features[0].attributes;
    return {
      zone: String(a.FLD_ZONE ?? ''),
      floodwayType: String(a.FLOODWAY ?? 'None'),
      panelNumber: String(a.DFIRM_PAN ?? ''),
    };
  } catch {
    return null; // FEMA service can be slow — don't block on failure
  }
}

/** NREL solar / wind resource query. */
async function querySolarWind(
  lat: number, lng: number,
): Promise<SolarWindResource | null> {
  const params = new URLSearchParams({
    api_key: NREL_API_KEY,
    lat: String(lat),
    lon: String(lng),
  });

  try {
    const res = await fetch(`${NREL_SOLAR_URL}?${params}`);
    if (!res.ok) return null;

    const data = await res.json();
    const outputs = data.outputs;
    if (!outputs) return null;

    return {
      ghi: Number(outputs.avg_ghi?.annual) || 0,
      dni: Number(outputs.avg_dni?.annual) || 0,
      windSpeed: Number(outputs.avg_wind_speed?.annual) || 0,
      capacity: Number(outputs.avg_lat_tilt?.annual) || 0,
    };
  } catch {
    return null; // NREL service is optional — don't block
  }
}

// ── Main lookup ─────────────────────────────────────────────────────────────

export interface LookupOptions {
  coordinates?: { lat: number; lng: number };
  address?: string;
}

/**
 * Full power infrastructure analysis for a site.
 *
 * Runs 7 queries in parallel across 4 data sources:
 * - HIFLD: control areas, retail territories, planning areas, substations, lines, power plants
 * - FEMA: flood zone
 * - NREL: solar/wind resource
 */
export async function lookupInfrastructure(opts: LookupOptions): Promise<InfraResult> {
  let { lat, lng } = opts.coordinates ?? { lat: 0, lng: 0 };

  if (!opts.coordinates || (lat === 0 && lng === 0)) {
    if (!opts.address) {
      throw new Error('Provide an address or coordinates to look up infrastructure.');
    }
    ({ lat, lng } = await geocodeAddress(opts.address));
  }

  // Fire all queries in parallel
  const [
    iso,
    utilityTerritory,
    tsp,
    substations,
    lines,
    powerPlants,
    floodZone,
    solarWind,
  ] = await Promise.all([
    queryPolygonLayer(LAYERS.controlAreas, lat, lng),
    queryPolygonLayer(LAYERS.retailTerritories, lat, lng),
    queryPolygonLayer(LAYERS.planningAreas, lat, lng),
    querySubstations(lat, lng),
    queryTransmissionLines(lat, lng),
    queryPowerPlants(lat, lng),
    queryFloodZone(lat, lng),
    querySolarWind(lat, lng),
  ]);

  // Nearest POI = closest substation
  const nearest = substations[0];

  return {
    iso,
    utilityTerritory,
    tsp,
    nearestPoiName: nearest?.name ?? '',
    nearestPoiDistMi: nearest?.distanceMi ?? 0,
    nearbySubstations: substations,
    nearbyLines: lines,
    nearbyPowerPlants: powerPlants,
    floodZone,
    solarWind,
  };
}
