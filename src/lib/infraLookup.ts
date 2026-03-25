/**
 * Power Infrastructure Lookup via HIFLD ArcGIS FeatureServer + FEMA + NREL.
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

// ~10 miles in degrees
const LAT_OFFSET = 0.145; // 10mi / 69mi per degree
const LNG_OFFSET_AT_30 = 0.167; // adjusted for ~30° latitude

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

function lngOffset(lat: number): number {
  return LNG_OFFSET_AT_30 / Math.cos((lat * Math.PI) / 180) * Math.cos((30 * Math.PI) / 180);
}

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number }> {
  const params = new URLSearchParams({
    singleLine: address,
    outFields: 'Match_addr',
    maxLocations: '1',
    f: 'json',
  });
  const res = await fetch(`${GEOCODE_URL}?${params}`);
  if (!res.ok) throw new Error(`Geocode request failed (${res.status})`);
  const data = await res.json();
  if (!data.candidates?.length) {
    throw new Error('Address could not be geocoded — check the address and try again.');
  }
  return { lat: data.candidates[0].location.y, lng: data.candidates[0].location.x };
}

// ── Query functions ─────────────────────────────────────────────────────────

/** Point-in-polygon → array of NAME values */
async function queryTerritory(
  label: string, layerUrl: string, lat: number, lng: number,
): Promise<string[]> {
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
  try {
    const res = await fetch(`${layerUrl}/query?${params}`);
    if (!res.ok) { console.warn(`[Infra] ${label} HTTP ${res.status}`); return []; }
    const data = await res.json();
    if (data.error) { console.warn(`[Infra] ${label} error:`, data.error); return []; }
    const feats = data.features ?? [];
    console.log(`[Infra] ${label}: ${feats.length} feature(s)`);
    return feats.map((f: { attributes: { NAME: string } }) => f.attributes.NAME).filter(Boolean);
  } catch (err) {
    console.warn(`[Infra] ${label} fetch error:`, err);
    return [];
  }
}

/**
 * Nearby substations — uses WHERE clause with lat/lng bounds (10mi box).
 * This avoids the `distance` param which some HIFLD services reject.
 */
async function querySubstations(lat: number, lng: number): Promise<NearbySubstation[]> {
  const lo = lngOffset(lat);
  const params = new URLSearchParams({
    where: `LATITUDE>${lat - LAT_OFFSET} AND LATITUDE<${lat + LAT_OFFSET} AND LONGITUDE>${lng - lo} AND LONGITUDE<${lng + lo}`,
    outFields: 'NAME,OWNER,MAX_VOLT,MIN_VOLT,STATUS,LINES,LATITUDE,LONGITUDE',
    returnGeometry: 'false',
    f: 'json',
  });
  try {
    const url = `${LAYERS.substations}/query?${params}`;
    console.log('[Infra] Substations URL:', url);
    const res = await fetch(url);
    if (!res.ok) { console.warn('[Infra] Substations HTTP', res.status); return []; }
    const data = await res.json();
    if (data.error) { console.warn('[Infra] Substations error:', data.error); return []; }
    const feats = data.features ?? [];
    console.log(`[Infra] Substations: ${feats.length} feature(s)`);
    return feats
      .map((f: { attributes: Record<string, unknown> }) => {
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
      .sort((a: NearbySubstation, b: NearbySubstation) => a.distanceMi - b.distanceMi);
  } catch (err) {
    console.warn('[Infra] Substations fetch error:', err);
    return [];
  }
}

/** Nearby transmission lines — uses geometry envelope (lines don't have lat/lng fields). */
async function queryLines(lat: number, lng: number): Promise<NearbyLine[]> {
  const lo = lngOffset(lat);
  const envelope = `${lng - lo},${lat - LAT_OFFSET},${lng + lo},${lat + LAT_OFFSET}`;
  const params = new URLSearchParams({
    where: '1=1',
    geometry: envelope,
    geometryType: 'esriGeometryEnvelope',
    spatialRel: 'esriSpatialRelIntersects',
    inSR: '4326',
    outFields: 'OWNER,VOLTAGE,VOLT_CLASS,SUB_1,SUB_2,STATUS',
    returnGeometry: 'false',
    resultRecordCount: '50',
    f: 'json',
  });
  try {
    const url = `${LAYERS.transmissionLines}/query?${params}`;
    console.log('[Infra] Lines URL:', url);
    const res = await fetch(url);
    if (!res.ok) { console.warn('[Infra] Lines HTTP', res.status); return []; }
    const data = await res.json();
    if (data.error) { console.warn('[Infra] Lines error:', data.error); return []; }
    const feats = data.features ?? [];
    console.log(`[Infra] Lines: ${feats.length} feature(s)`);
    return feats
      .map((f: { attributes: Record<string, unknown> }) => {
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
      .sort((a: NearbyLine, b: NearbyLine) => b.voltage - a.voltage);
  } catch (err) {
    console.warn('[Infra] Lines fetch error:', err);
    return [];
  }
}

/** Nearby power plants — uses WHERE clause with lat/lng bounds. */
async function queryPowerPlants(lat: number, lng: number): Promise<NearbyPowerPlant[]> {
  const lo = lngOffset(lat);
  const params = new URLSearchParams({
    where: `LATITUDE>${lat - LAT_OFFSET} AND LATITUDE<${lat + LAT_OFFSET} AND LONGITUDE>${lng - lo} AND LONGITUDE<${lng + lo}`,
    outFields: 'PLANT_NAME,PRIMESOURC,INSTALL_MW,STATUS,OPERATOR,LATITUDE,LONGITUDE',
    returnGeometry: 'false',
    f: 'json',
  });
  try {
    const url = `${LAYERS.powerPlants}/query?${params}`;
    console.log('[Infra] Plants URL:', url);
    const res = await fetch(url);
    if (!res.ok) { console.warn('[Infra] Plants HTTP', res.status); return []; }
    const data = await res.json();
    if (data.error) { console.warn('[Infra] Plants error:', data.error); return []; }
    const feats = data.features ?? [];
    console.log(`[Infra] Plants: ${feats.length} feature(s)`);
    return feats
      .map((f: { attributes: Record<string, unknown> }) => {
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
      .sort((a: NearbyPowerPlant, b: NearbyPowerPlant) => a.distanceMi - b.distanceMi);
  } catch (err) {
    console.warn('[Infra] Plants fetch error:', err);
    return [];
  }
}

/** FEMA flood zone (point-in-polygon). */
async function queryFloodZone(lat: number, lng: number): Promise<FloodZoneInfo | null> {
  const params = new URLSearchParams({
    where: '1=1',
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    spatialRel: 'esriSpatialRelIntersects',
    inSR: '4326',
    outFields: '*',
    returnGeometry: 'false',
    f: 'json',
  });
  try {
    const res = await fetch(`${FEMA_NFHL_URL}/query?${params}`);
    if (!res.ok) { console.warn('[Infra] FEMA HTTP', res.status); return null; }
    const data = await res.json();
    if (data.error) { console.warn('[Infra] FEMA error:', data.error); return null; }
    const feats = data.features ?? [];
    console.log(`[Infra] FEMA: ${feats.length} feature(s)`, feats[0]?.attributes);
    if (feats.length === 0) return null;
    const a = feats[0].attributes;
    return {
      zone: String(a.FLD_ZONE ?? a.ZONE ?? ''),
      floodwayType: String(a.FLOODWAY ?? 'None'),
      panelNumber: String(a.ZONE_SUBTY ?? a.DFIRM_PAN ?? ''),
    };
  } catch (err) {
    console.warn('[Infra] FEMA fetch error:', err);
    return null;
  }
}

/** NREL solar/wind resource */
async function querySolarWind(lat: number, lng: number): Promise<SolarWindResource | null> {
  try {
    const params = new URLSearchParams({
      api_key: NREL_API_KEY,
      lat: String(lat),
      lon: String(lng),
    });
    const res = await fetch(`${NREL_SOLAR_URL}?${params}`);
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
