/**
 * Broadband Data Lookup.
 *
 * Data sources (all public, free):
 * - FCC Census Block API (geo.fcc.gov): FIPS, county, state from lat/lon
 * - ArcGIS Living Atlas – FCC BDC: Provider availability by census block
 * - Built-in: ISO/RTO detection (reused from infraLookup)
 *
 * Flow: coordinates → FIPS → ArcGIS BDC query → BroadbandResult
 */

import type {
  BroadbandProvider,
  BroadbandResult,
  ConnectivityTier,
  TechnologyType,
} from '../types';
import { TECH_CODE_MAP } from '../types';
import { geocodeAddress } from './infraLookup';

// ── Endpoints ───────────────────────────────────────────────────────────────

const FCC_CENSUS_URL = 'https://geo.fcc.gov/api/census/block/find';

/**
 * ArcGIS Living Atlas – FCC Broadband Data Collection.
 * Org: jIL9msH9OI208GCb (Esri Content / Living Atlas)
 *
 * Layer structure (6 sublayers + related tables):
 * 0 = State, 1 = County, 2 = Tract, 3 = Block Group, 4 = Block, 5 = H3 Hex
 * Each sublayer has a related table with per-provider detail.
 *
 * We query layer 4 (Block) by census block FIPS, then the related table
 * for individual provider records.
 */
const ARCGIS_FCC_BDC =
  'https://services8.arcgis.com/peDZJliSvYims39Q/arcgis/rest/services';

// Try multiple vintage names — Esri updates biannually
// Org peDZJliSvYims39Q on services8 is the Esri Living Atlas content org
const BDC_SERVICE_NAMES = [
  'FCC_Broadband_Data_Collection_June_2025_View',
  'FCC_Broadband_Data_Collection_December_2024_View',
  'FCC_Broadband_Data_Collection_June_2024_View',
];

const BLOCK_LAYER = 4;    // Census Block sublayer

// ── FCC Census Block API ────────────────────────────────────────────────────

interface CensusBlockResult {
  fips: string;
  countyFips: string;
  countyName: string;
  stateCode: string;
  stateName: string;
}

async function queryCensusBlock(lat: number, lng: number): Promise<CensusBlockResult> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    format: 'json',
  });

  const res = await fetch(`${FCC_CENSUS_URL}?${params}`);
  if (!res.ok) throw new Error(`FCC Census API returned ${res.status}`);

  const data = await res.json();
  if (data.status !== 'OK' || !data.Block?.FIPS) {
    throw new Error('Could not resolve census block for these coordinates.');
  }

  return {
    fips: data.Block.FIPS,
    countyFips: data.County?.FIPS ?? data.Block.FIPS.slice(0, 5),
    countyName: data.County?.name ?? '',
    stateCode: data.State?.code ?? '',
    stateName: data.State?.name ?? '',
  };
}

// ── ArcGIS FCC BDC Query ────────────────────────────────────────────────────

/**
 * Discover the working FeatureServer URL by trying multiple vintage names.
 * Caches the result for the session.
 */
let _cachedServiceUrl: string | null = null;

async function discoverServiceUrl(): Promise<string | null> {
  if (_cachedServiceUrl) return _cachedServiceUrl;

  for (const name of BDC_SERVICE_NAMES) {
    const url = `${ARCGIS_FCC_BDC}/${name}/FeatureServer`;
    try {
      const res = await fetch(`${url}?f=json`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.layers && data.layers.length > 0) {
        _cachedServiceUrl = url;
        return url;
      }
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Query the ArcGIS FCC BDC FeatureServer for broadband providers at a census block.
 *
 * Strategy:
 * 1. Spatial query on Block layer (4) using point geometry
 * 2. Get the related table ID from layer info
 * 3. Query related records for provider details
 *
 * Fallback: if related table query fails, use block-level summary data.
 */
async function queryBroadbandProviders(
  lat: number,
  lng: number,
  fips: string,
): Promise<BroadbandProvider[]> {
  const serviceUrl = await discoverServiceUrl();
  if (!serviceUrl) return [];

  // Strategy 1: Query related table via relationship query on the Block layer
  try {
    // First, find the block feature by spatial query
    const blockUrl =
      `${serviceUrl}/${BLOCK_LAYER}/query?` +
      `where=1%3D1` +
      `&geometry=${lng}%2C${lat}` +
      `&geometryType=esriGeometryPoint` +
      `&spatialRel=esriSpatialRelIntersects` +
      `&inSR=4326` +
      `&outFields=*` +
      `&returnGeometry=false` +
      `&resultRecordCount=1` +
      `&f=json`;

    const blockRes = await fetch(blockUrl, { signal: AbortSignal.timeout(10000) });
    if (!blockRes.ok) return [];

    const blockData = await blockRes.json();
    if (blockData.error || !blockData.features?.length) {
      // Try attribute query by FIPS as fallback
      return await queryProvidersByFips(serviceUrl, fips);
    }

    const blockOid = blockData.features[0].attributes.OBJECTID ??
                     blockData.features[0].attributes.FID;

    if (blockOid == null) {
      return await queryProvidersByFips(serviceUrl, fips);
    }

    // Query related records — try relationship IDs 0-2
    // (related tables at IDs 6-11 mirror feature layers 0-5)
    let relData: Record<string, unknown> = {};
    for (const relId of [0, 1, 2]) {
      const relUrl =
        `${serviceUrl}/${BLOCK_LAYER}/queryRelatedRecords?` +
        `objectIds=${blockOid}` +
        `&relationshipId=${relId}` +
        `&outFields=*` +
        `&returnGeometry=false` +
        `&f=json`;

      const relRes = await fetch(relUrl, { signal: AbortSignal.timeout(10000) });
      if (!relRes.ok) continue;
      const data = await relRes.json();
      if (!data.error && (data.relatedRecordGroups?.length ?? 0) > 0) {
        relData = data;
        break;
      }
    }

    const relatedGroups = (relData as { relatedRecordGroups?: unknown[] }).relatedRecordGroups ?? [];
    const providers: BroadbandProvider[] = [];

    for (const group of relatedGroups) {
      for (const record of group.relatedRecords ?? []) {
        const a = record.attributes;
        const provider = parseProviderRecord(a);
        if (provider) providers.push(provider);
      }
    }

    return deduplicateProviders(providers);
  } catch {
    return [];
  }
}

/** Fallback: query block layer by FIPS attribute. */
async function queryProvidersByFips(
  serviceUrl: string,
  fips: string,
): Promise<BroadbandProvider[]> {
  try {
    // Try querying the block layer by FIPS code
    const blockUrl =
      `${serviceUrl}/${BLOCK_LAYER}/query?` +
      `where=GEOID%3D%27${fips}%27+OR+geoid20%3D%27${fips}%27+OR+block_fips%3D%27${fips}%27` +
      `&outFields=*` +
      `&returnGeometry=false` +
      `&resultRecordCount=1` +
      `&f=json`;

    const res = await fetch(blockUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];

    const data = await res.json();
    if (data.error || !data.features?.length) return [];

    const blockOid = data.features[0].attributes.OBJECTID ??
                     data.features[0].attributes.FID;

    if (blockOid == null) return [];

    let relData: Record<string, unknown> = {};
    for (const relId of [0, 1, 2]) {
      const relUrl =
        `${serviceUrl}/${BLOCK_LAYER}/queryRelatedRecords?` +
        `objectIds=${blockOid}` +
        `&relationshipId=${relId}` +
        `&outFields=*` +
        `&returnGeometry=false` +
        `&f=json`;

      const relRes = await fetch(relUrl, { signal: AbortSignal.timeout(10000) });
      if (!relRes.ok) continue;
      const d = await relRes.json();
      if (!d.error && (d.relatedRecordGroups?.length ?? 0) > 0) {
        relData = d;
        break;
      }
    }

    const providers: BroadbandProvider[] = [];

    for (const group of (relData as { relatedRecordGroups?: unknown[] }).relatedRecordGroups ?? []) {
      for (const record of group.relatedRecords ?? []) {
        const provider = parseProviderRecord(record.attributes);
        if (provider) providers.push(provider);
      }
    }

    return deduplicateProviders(providers);
  } catch {
    return [];
  }
}

/** Parse a single provider record from the related table. */
function parseProviderRecord(a: Record<string, unknown>): BroadbandProvider | null {
  if (!a) return null;

  // Field names vary across vintages — try common patterns
  const providerName =
    String(a.brand_name ?? a.BrandName ?? a.dba_name ?? a.DBAName ?? a.provider_name ?? a.ProviderName ?? '');
  if (!providerName) return null;

  const techCode = Number(a.tech_code ?? a.TechCode ?? a.technology_code ?? a.TechnologyCode ?? 0);
  const technology: TechnologyType = TECH_CODE_MAP[techCode] ?? 'Other';

  const maxDown = Number(a.max_advertised_download_speed ?? a.MaxAdDown ?? a.max_down ?? a.MaxDown ?? 0);
  const maxUp = Number(a.max_advertised_upload_speed ?? a.MaxAdUp ?? a.max_up ?? a.MaxUp ?? 0);
  const lowLatency = Boolean(
    a.low_latency ?? a.LowLatency ?? a.latency ?? (techCode >= 10 && techCode <= 60),
  );

  return { providerName, technology, techCode, maxDown, maxUp, lowLatency };
}

/** Remove duplicate provider+technology entries, keeping the highest speed. */
function deduplicateProviders(providers: BroadbandProvider[]): BroadbandProvider[] {
  const map = new Map<string, BroadbandProvider>();

  for (const p of providers) {
    const key = `${p.providerName}|${p.technology}`;
    const existing = map.get(key);
    if (!existing || p.maxDown > existing.maxDown) {
      map.set(key, p);
    }
  }

  return [...map.values()].sort((a, b) => b.maxDown - a.maxDown);
}

// ── Classification ──────────────────────────────────────────────────────────

function classifyConnectivity(providers: BroadbandProvider[]): ConnectivityTier {
  const hasServed = providers.some(
    (p) => p.lowLatency && p.maxDown >= 100 && p.maxUp >= 20 &&
           ['Fiber', 'Cable', 'DSL', 'Fixed Wireless'].includes(p.technology),
  );
  if (hasServed) return 'Served';

  const hasUnderserved = providers.some(
    (p) => p.lowLatency && p.maxDown >= 25 && p.maxUp >= 3,
  );
  if (hasUnderserved) return 'Underserved';

  return 'Unserved';
}

// ── ISO Detection (reused logic from infraLookup) ───────────────────────────

function detectIso(lat: number, lng: number): string {
  // ERCOT
  if (lat >= 26 && lat <= 34.5 && lng >= -104 && lng <= -94 &&
      !(lng < -104.5) && !(lat > 34 && lng < -100) && !(lat > 33 && lng > -94.5))
    return 'ERCOT';
  // CAISO
  if (lat >= 32.5 && lat <= 42 && lng >= -124.5 && lng <= -114.5 && lng < -115.5)
    return 'CAISO';
  // NYISO
  if (lat >= 40.5 && lat <= 45.1 && lng >= -79.8 && lng <= -71.8)
    return 'NYISO';
  // ISO-NE
  if (lat >= 41 && lat <= 47.5 && lng >= -73.7 && lng <= -66.9)
    return 'ISO-NE';
  // PJM
  if (lat >= 36 && lat <= 42.5 && lng >= -85.5 && lng <= -74 &&
      !(lat > 40.5 && lng > -74.5 && lng < -71.8))
    return 'PJM';
  // MISO
  if (((lat >= 37 && lat <= 49 && lng >= -104 && lng <= -82.5) ||
       (lat >= 29 && lat < 37 && lng >= -97 && lng <= -88)) &&
      !(lat >= 36 && lat <= 42.5 && lng >= -85.5 && lng <= -74) &&
      !(lat >= 26 && lat <= 34.5 && lng >= -104 && lng <= -94))
    return 'MISO';
  // SPP
  if (lat >= 33 && lat <= 43 && lng >= -104 && lng <= -93 &&
      !(lat < 34 && lng > -100) && !(lat > 43))
    return 'SPP';
  // Defaults
  if (lng < -104) return 'WECC';
  if (lat < 37 && lng > -90) return 'SERC';
  return '';
}

// ── FCC Map URL ─────────────────────────────────────────────────────────────

function buildFccMapUrl(lat: number, lng: number): string {
  const addr = encodeURIComponent(`${lat}, ${lng}`);
  return (
    `https://broadbandmap.fcc.gov/location-summary/fixed` +
    `?version=jun2025` +
    `&addr_full=${addr}` +
    `&lat=${lat}&lon=${lng}` +
    `&zoom=15.00&br=r&speed=100_20&tech=1_2_3_6_7`
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

export interface BroadbandLookupOptions {
  coordinates?: { lat: number; lng: number };
  address?: string;
}

export async function lookupBroadband(opts: BroadbandLookupOptions): Promise<BroadbandResult> {
  let { lat, lng } = opts.coordinates ?? { lat: 0, lng: 0 };

  if (!opts.coordinates || (lat === 0 && lng === 0)) {
    if (!opts.address) throw new Error('Provide an address or coordinates.');
    ({ lat, lng } = await geocodeAddress(opts.address));
  }

  // Census block first (needed for FIPS-based provider query)
  const census = await queryCensusBlock(lat, lng);
  const providers = await queryBroadbandProviders(lat, lng, census.fips);

  const tier = classifyConnectivity(providers);
  const iso = detectIso(lat, lng);

  return {
    fips: census.fips,
    countyFips: census.countyFips,
    countyName: census.countyName,
    stateCode: census.stateCode,
    stateName: census.stateName,

    providers,
    totalProviders: new Set(providers.map((p) => p.providerName)).size,
    fiberAvailable: providers.some((p) => p.technology === 'Fiber'),
    cableAvailable: providers.some((p) => p.technology === 'Cable'),
    fixedWirelessAvailable: providers.some((p) => p.technology === 'Fixed Wireless'),
    maxDownload: providers.length > 0 ? Math.max(...providers.map((p) => p.maxDown)) : 0,
    maxUpload: providers.length > 0 ? Math.max(...providers.map((p) => p.maxUp)) : 0,

    tier,
    iso,
    utilityTerritory: [], // Will be populated if power infra data available

    fccMapUrl: buildFccMapUrl(lat, lng),
    analyzedAt: Date.now(),
  };
}
