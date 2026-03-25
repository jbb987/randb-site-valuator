/**
 * Power Infrastructure Lookup via HIFLD ArcGIS FeatureServer.
 *
 * Flow: address or coordinates → geocode (if needed) → 3 point-in-polygon
 * queries against HIFLD layers → { iso, utilityTerritory, tsp }.
 *
 * All endpoints are public / no API key required.
 */

export interface InfraResult {
  iso: string;
  utilityTerritory: string;
  tsp: string;
}

// ── HIFLD layer endpoints ───────────────────────────────────────────────────
const HIFLD_BASE =
  'https://services1.arcgis.com/Hp6G80Pky0om6HgA/arcgis/rest/services';

const LAYERS = {
  /** Layer 0 – Control Areas → RTO / ISO */
  controlAreas: `${HIFLD_BASE}/Control_Areas/FeatureServer/0`,
  /** Electric Retail Service Territories → Utility Territory */
  retailTerritories: `${HIFLD_BASE}/Electric_Retail_Service_Territories_2/FeatureServer/0`,
  /** Electric Planning Areas → Transmission Service Provider */
  planningAreas: `${HIFLD_BASE}/Electric_Planning_Areas/FeatureServer/0`,
} as const;

// ── ArcGIS geocoder (free tier, no key) ─────────────────────────────────────
const GEOCODE_URL =
  'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates';

// ── Helpers ─────────────────────────────────────────────────────────────────

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

/** Run a point-in-polygon query on a single HIFLD layer, return the NAME field. */
async function queryLayer(layerUrl: string, lat: number, lng: number): Promise<string> {
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
  // Multiple overlapping territories — join with " / "
  return features.map((f) => f.attributes.NAME).join(' / ');
}

// ── Main lookup ─────────────────────────────────────────────────────────────

export interface LookupOptions {
  /** Pre-parsed coordinates — skip geocoding if provided. */
  coordinates?: { lat: number; lng: number };
  /** Raw address string — geocoded if coordinates are not supplied. */
  address?: string;
}

/**
 * Look up RTO/ISO, utility territory, and transmission provider for a site.
 *
 * Provide either `coordinates` (preferred) or `address`. If both are given,
 * coordinates take precedence.
 */
export async function lookupInfrastructure(opts: LookupOptions): Promise<InfraResult> {
  let { lat, lng } = opts.coordinates ?? { lat: 0, lng: 0 };

  if (!opts.coordinates || (lat === 0 && lng === 0)) {
    if (!opts.address) {
      throw new Error('Provide an address or coordinates to look up infrastructure.');
    }
    ({ lat, lng } = await geocodeAddress(opts.address));
  }

  // Fire all three queries in parallel
  const [iso, utilityTerritory, tsp] = await Promise.all([
    queryLayer(LAYERS.controlAreas, lat, lng),
    queryLayer(LAYERS.retailTerritories, lat, lng),
    queryLayer(LAYERS.planningAreas, lat, lng),
  ]);

  return { iso, utilityTerritory, tsp };
}
