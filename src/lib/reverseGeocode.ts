/**
 * Reverse geocoding — returns county and nearest city/town for a lat/lng.
 *
 * Primary: BigDataCloud (no API key, client-side, fast).
 * Fallback: Nominatim / OpenStreetMap.
 *
 * Results are cached via the shared request cache.
 */

import { cachedFetch, TTL_LOCATION } from './requestCache';

export interface GeoLocation {
  city: string;
  county: string;
}

async function tryBigDataCloud(lat: number, lng: number): Promise<GeoLocation | null> {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();

    const city = data.city || data.locality || '';
    // County is in localityInfo.administrative — find the county-level entry
    // In the US, counties are admin level 6, NOT level 2 (which is country)
    let county = '';
    const admins = data.localityInfo?.administrative;
    if (Array.isArray(admins)) {
      // Priority 1: find entry whose name contains "County"
      // Priority 2: admin level 6 (US county level)
      // Priority 3: admin level 5 (some states use this)
      const countyEntry =
        admins.find((a: { name?: string }) => a.name && a.name.includes('County')) ??
        admins.find((a: { adminLevel?: number }) => a.adminLevel === 6) ??
        admins.find((a: { adminLevel?: number }) => a.adminLevel === 5);
      if (countyEntry?.name) {
        county = countyEntry.name;
      }
    }

    if (city || county) return { city, county };
    return null;
  } catch {
    return null;
  }
}

async function tryNominatim(lat: number, lng: number): Promise<GeoLocation | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'RBPowerPlatform/1.0' },
    });
    if (!res.ok) return null;
    const data = await res.json();

    const city = data.address?.city || data.address?.town || data.address?.village || '';
    const county = data.address?.county || '';

    if (city || county) return { city, county };
    return null;
  } catch {
    return null;
  }
}

/**
 * Reverse geocode a lat/lng to get county and nearest city.
 * Results are cached via the shared request cache.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<GeoLocation> {
  const key = `reverseGeo:${lat.toFixed(3)},${lng.toFixed(3)}`;
  return cachedFetch(key, async () => {
    return (await tryBigDataCloud(lat, lng)) ?? (await tryNominatim(lat, lng)) ?? { city: '', county: '' };
  }, TTL_LOCATION);
}
