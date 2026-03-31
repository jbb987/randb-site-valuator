/**
 * Water Analysis — Phase 1
 *
 * Data sources (all public, free):
 * - FEMA NFHL ArcGIS REST: Flood zone designation (hazards.fema.gov)
 * - USGS NLDI API: Stream/basin delineation and monitoring stations (api.water.usgs.gov/nldi)
 * - USFWS NWI ArcGIS REST: National Wetlands Inventory (fwspublicservices.wim.usgs.gov)
 *
 * CORS notes:
 * - FEMA NFHL: does NOT support CORS — routed through corsproxy.io
 * - USGS NLDI: supports CORS ✓
 * - USFWS NWI: does NOT support CORS — routed through corsproxy.io
 *   For production, replace corsproxy.io with a dedicated Cloudflare Worker or
 *   backend proxy to avoid rate limits and third-party dependency.
 */

import type {
  FloodRiskLevel,
  FloodZoneInfo,
  MonitoringStation,
  StreamInfo,
  WaterAnalysisResult,
  WetlandFeature,
  WetlandsInfo,
} from './waterAnalysis.types';
import { geocodeAddress } from './infraLookup';

// ── CORS proxy ──────────────────────────────────────────────────────────────

/**
 * Fetch a URL through a CORS proxy.
 * In development, government ArcGIS servers (FEMA, USFWS) block browser
 * requests that lack an Origin they trust. We route through corsproxy.io
 * as a stop-gap. Replace with a first-party proxy for production.
 */
async function corsFetch(url: string, init?: RequestInit): Promise<Response> {
  const proxied = `https://corsproxy.io/?${encodeURIComponent(url)}`;
  return fetch(proxied, init);
}

// ── FEMA NFHL ───────────────────────────────────────────────────────────────

/**
 * FEMA National Flood Hazard Layer — Flood Hazard Area sublayer (28).
 * MapServer 28 = S_FLD_HAZ_AR (Flood Hazard Areas)
 */
const FEMA_NFHL_URL =
  'https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/28/query';

const FLOOD_ZONE_DESCRIPTIONS: Record<string, string> = {
  X: 'Minimal flood hazard — outside of the 0.2% annual chance floodplain',
  B: 'Moderate flood hazard — between the limits of the base flood and the 0.2% annual chance flood',
  C: 'Minimal flood hazard — above the 0.2% annual chance floodplain',
  A: 'Special Flood Hazard Area — 1% annual chance flood (100-year floodplain), no BFE',
  AE: 'Special Flood Hazard Area — 1% annual chance flood with Base Flood Elevations determined',
  AH: 'Special Flood Hazard Area — 1% annual chance shallow flooding (ponding), with BFE',
  AO: 'Special Flood Hazard Area — 1% annual chance shallow flooding (sheet flow), depth specified',
  AR: 'Special Flood Hazard Area — flood hazard due to levee system restoration',
  VE: 'Coastal High Hazard Area — 1% annual chance flood with wave action, with BFE',
  V: 'Coastal High Hazard Area — 1% annual chance flood with wave action, no BFE',
  D: 'Undetermined flood hazard — possible but not studied',
};

/** Derive a plain-language description, handling A1–A30 and V1–V30 zones. */
function describeZone(zone: string): string {
  const base = FLOOD_ZONE_DESCRIPTIONS[zone];
  if (base) return base;

  if (/^A\d+$/.test(zone)) {
    return 'Special Flood Hazard Area — 1% annual chance flood with Base Flood Elevations (numbered zone)';
  }
  if (/^V\d+$/.test(zone)) {
    return 'Coastal High Hazard Area — 1% annual chance flood with wave action (numbered zone)';
  }

  return `Flood zone ${zone} — consult local floodplain administrator for details`;
}

function classifyFloodRisk(zone: string, subtype: string): FloodRiskLevel {
  if (!zone || zone === 'AREA NOT INCLUDED') return 'unknown';

  if (zone === 'VE' || /^V\d+$/.test(zone) || zone === 'V') return 'very-high';

  if (zone === 'A' || /^A\d+$/.test(zone) || zone === 'AE' || zone === 'AH' ||
      zone === 'AO' || zone === 'AR') return 'high';

  if (subtype === 'FLOODWAY') return 'very-high';

  if (zone === 'B' || zone === 'D') return 'moderate';

  if (zone === 'X' && subtype && subtype.includes('0.2')) return 'moderate';

  if (zone === 'X' || zone === 'C') return 'minimal';

  return 'unknown';
}

async function fetchFloodZone(lat: number, lng: number): Promise<FloodZoneInfo> {
  const params = new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelContains',
    outFields: 'FLD_ZONE,ZONE_SUBTY,STATIC_BFE',
    returnGeometry: 'false',
    f: 'json',
  });

  const res = await corsFetch(`${FEMA_NFHL_URL}?${params}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`FEMA NFHL returned HTTP ${res.status}`);

  const data = await res.json();
  if (data.error) throw new Error(`FEMA NFHL error: ${data.error.message}`);

  if (!data.features || data.features.length === 0) {
    return {
      zone: 'UNMAPPED',
      zoneSubtype: '',
      staticBfe: null,
      riskLevel: 'unknown' as FloodRiskLevel,
      description: 'No FEMA flood zone data available for this location. The area may be unmapped.',
    };
  }

  const a = data.features[0].attributes as Record<string, unknown>;
  const zone = String(a.FLD_ZONE ?? 'UNKNOWN').trim();
  const zoneSubtype = String(a.ZONE_SUBTY ?? '').trim();
  const bfeRaw = a.STATIC_BFE;
  const staticBfe = bfeRaw != null && Number(bfeRaw) > -9000 ? Number(bfeRaw) : null;
  const riskLevel = classifyFloodRisk(zone, zoneSubtype);
  const description = describeZone(zone);

  return { zone, zoneSubtype, staticBfe, riskLevel, description };
}

// ── USGS NLDI ───────────────────────────────────────────────────────────────

const NLDI_BASE = 'https://api.water.usgs.gov/nldi/linked-data';

interface NldiComidResponse {
  features?: Array<{
    properties: {
      comid?: string | number;
      name?: string;
      reachcode?: string;
      streamleve?: number;
      [key: string]: unknown;
    };
  }>;
}

interface NldiStationFeature {
  properties: {
    identifier?: string;
    name?: string;
    type?: string;
    [key: string]: unknown;
  };
}

async function fetchStreamData(lat: number, lng: number): Promise<StreamInfo> {
  const positionUrl =
    `${NLDI_BASE}/comid/position?coords=POINT(${lng}%20${lat})`;

  let comid: string | null = null;
  let streamName: string | null = null;
  let reachCode: string | null = null;
  let streamOrder: number | null = null;

  try {
    const posRes = await fetch(positionUrl, { signal: AbortSignal.timeout(15000) });
    if (posRes.ok) {
      const posData = (await posRes.json()) as NldiComidResponse;
      const feature = posData.features?.[0];
      if (feature) {
        comid = feature.properties.comid != null
          ? String(feature.properties.comid)
          : null;
        streamName = feature.properties.name || null;
        reachCode = feature.properties.reachcode || null;
        streamOrder = typeof feature.properties.streamleve === 'number'
          ? feature.properties.streamleve
          : null;
      }
    }
  } catch { /* NLDI position query failed — continue */ }

  if (!comid) {
    return {
      comid: null,
      streamName: null,
      reachCode: null,
      streamOrder: null,
      basinAreaKm2: null,
      navigationStatus: 'not-found',
      monitoringStations: [],
    };
  }

  const [basinAreaKm2, monitoringStations] = await Promise.all([
    fetchBasinArea(comid),
    fetchMonitoringStations(comid),
  ]);

  return {
    comid,
    streamName,
    reachCode,
    streamOrder,
    basinAreaKm2,
    navigationStatus: 'found',
    monitoringStations,
  };
}

async function fetchBasinArea(comid: string): Promise<number | null> {
  try {
    const url = `${NLDI_BASE}/comid/${comid}/basin?simplified=true`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;

    const data = await res.json();
    const feature = data.features?.[0];
    if (!feature) return null;

    const areaSqKm = feature.properties?.areasqkm ?? feature.properties?.AreaSqKm ?? null;
    return areaSqKm != null ? Number(areaSqKm) : null;
  } catch {
    return null;
  }
}

async function fetchMonitoringStations(comid: string): Promise<MonitoringStation[]> {
  try {
    const url = `${NLDI_BASE}/comid/${comid}/navigate/UT/nwissite?distance=50`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];

    const data = await res.json();
    const features: NldiStationFeature[] = data.features ?? [];

    return features.slice(0, 5).map((f) => {
      const id = String(f.properties.identifier ?? f.properties.name ?? '');
      const name = String(f.properties.name ?? id);
      const type = String(f.properties.type ?? 'USGS Stream Gauge');
      return {
        identifier: id,
        name,
        type,
        url: id
          ? `https://waterdata.usgs.gov/nwis/uv?site_no=${id.replace(/^USGS-/, '')}`
          : 'https://waterdata.usgs.gov',
      };
    });
  } catch {
    return [];
  }
}

// ── NWI Wetlands ─────────────────────────────────────────────────────────────

/**
 * USFWS National Wetlands Inventory ArcGIS REST service.
 * Layer 0 = Wetlands polygons.
 * Buffer: ~500 feet (~0.0023 degrees latitude).
 */
const NWI_URL =
  'https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/0/query';

const BUFFER_DEG = 0.0023;

function decodeWetlandType(attribute: string): string {
  if (!attribute) return 'Unknown Wetland';

  const code = attribute.toUpperCase();

  if (code.startsWith('PEM')) return 'Palustrine Emergent Marsh';
  if (code.startsWith('PFO')) return 'Palustrine Forested Wetland';
  if (code.startsWith('PSS')) return 'Palustrine Scrub-Shrub Wetland';
  if (code.startsWith('PAB')) return 'Palustrine Aquatic Bed';
  if (code.startsWith('PUB')) return 'Palustrine Unconsolidated Bottom';
  if (code.startsWith('POW')) return 'Palustrine Open Water';
  if (code.startsWith('L'))   return 'Lacustrine (Lake) Wetland';
  if (code.startsWith('REM')) return 'Riverine Emergent';
  if (code.startsWith('ROW') || code.startsWith('RUB')) return 'Riverine Open Water / Streambed';
  if (code.startsWith('R'))   return 'Riverine Wetland';
  if (code.startsWith('E'))   return 'Estuarine Wetland';
  if (code.startsWith('M'))   return 'Marine Wetland';

  return `Wetland (${attribute})`;
}

function distanceFt(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 20925524;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchWetlands(lat: number, lng: number): Promise<WetlandsInfo> {
  const envelope = `${lng - BUFFER_DEG},${lat - BUFFER_DEG},${lng + BUFFER_DEG},${lat + BUFFER_DEG}`;

  const params = new URLSearchParams({
    geometry: envelope,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'ATTRIBUTE,WETLAND_TYPE,ACRES',
    returnGeometry: 'true',
    outSR: '4326',
    resultRecordCount: '20',
    f: 'json',
  });

  const res = await corsFetch(`${NWI_URL}?${params}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`NWI service returned HTTP ${res.status}`);

  const data = await res.json();
  if (data.error) throw new Error(`NWI error: ${data.error.message}`);

  if (!data.features || data.features.length === 0) {
    return { hasWetlands: false, wetlands: [], nearestWetlandFt: null };
  }

  const wetlands: WetlandFeature[] = [];

  for (const f of data.features) {
    const a = f.attributes as Record<string, unknown>;
    const attribute = String(a.ATTRIBUTE ?? a.attribute ?? '');
    const wetlandType = String(a.WETLAND_TYPE ?? a.wetland_type ?? '') || decodeWetlandType(attribute);
    const acres = a.ACRES != null ? Number(a.ACRES) : null;

    let distFt: number | null = null;
    const rings: number[][][] = f.geometry?.rings ?? [];
    if (rings.length > 0 && rings[0].length > 0) {
      const ring = rings[0];
      const avgLng = ring.reduce((s: number, p: number[]) => s + p[0], 0) / ring.length;
      const avgLat = ring.reduce((s: number, p: number[]) => s + p[1], 0) / ring.length;
      distFt = Math.round(distanceFt(lat, lng, avgLat, avgLng));
    }

    wetlands.push({ attribute, wetlandType: wetlandType || decodeWetlandType(attribute), acres, distanceFt: distFt });
  }

  wetlands.sort((a, b) => (a.distanceFt ?? Infinity) - (b.distanceFt ?? Infinity));

  return { hasWetlands: true, wetlands, nearestWetlandFt: wetlands[0]?.distanceFt ?? null };
}

// ── Main ─────────────────────────────────────────────────────────────────────

export interface WaterAnalysisOptions {
  coordinates?: { lat: number; lng: number };
  address?: string;
}

export async function analyzeWater(opts: WaterAnalysisOptions): Promise<WaterAnalysisResult> {
  let { lat, lng } = opts.coordinates ?? { lat: 0, lng: 0 };

  if (!opts.coordinates || (lat === 0 && lng === 0)) {
    if (!opts.address) throw new Error('Provide an address or coordinates.');
    ({ lat, lng } = await geocodeAddress(opts.address));
  }

  const [floodResult, streamResult, wetlandsResult] = await Promise.allSettled([
    fetchFloodZone(lat, lng),
    fetchStreamData(lat, lng),
    fetchWetlands(lat, lng),
  ]);

  return {
    lat,
    lng,
    analyzedAt: Date.now(),

    floodZone: floodResult.status === 'fulfilled' ? floodResult.value : null,
    floodZoneError:
      floodResult.status === 'rejected'
        ? (floodResult.reason instanceof Error ? floodResult.reason.message : 'Flood zone lookup failed')
        : null,

    stream: streamResult.status === 'fulfilled' ? streamResult.value : null,
    streamError:
      streamResult.status === 'rejected'
        ? (streamResult.reason instanceof Error ? streamResult.reason.message : 'Stream data lookup failed')
        : null,

    wetlands: wetlandsResult.status === 'fulfilled' ? wetlandsResult.value : null,
    wetlandsError:
      wetlandsResult.status === 'rejected'
        ? (wetlandsResult.reason instanceof Error ? wetlandsResult.reason.message : 'Wetlands lookup failed')
        : null,
  };
}
