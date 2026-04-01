/**
 * Cloudflare Pages Function — CORS proxy for USFWS NWI.
 *
 * Proxies /api/nwi/* → https://fwspublicservices.wim.usgs.gov/*
 * Adds CORS headers so the browser allows the response.
 *
 * Matches the Vite dev proxy in vite.config.ts so the same
 * client-side URL works in both dev and production.
 */

const NWI_ORIGIN = 'https://fwspublicservices.wim.usgs.gov';

export const onRequest: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);

  // Rewrite /api/nwi/wetlandsmapservice/... → https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/...
  const targetPath = url.pathname.replace(/^\/api\/nwi/, '');
  const targetUrl = `${NWI_ORIGIN}${targetPath}${url.search}`;

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request),
    });
  }

  try {
    const res = await fetch(targetUrl, {
      method: request.method,
      headers: { 'User-Agent': 'RBPowerPlatform/1.0' },
      signal: AbortSignal.timeout(15000), // NWI is slow — 15s timeout
    });

    const body = await res.arrayBuffer();
    return new Response(body, {
      status: res.status,
      headers: {
        ...Object.fromEntries(res.headers),
        ...corsHeaders(request),
        'Content-Type': res.headers.get('Content-Type') ?? 'application/json',
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'NWI proxy error' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
    });
  }
};

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') ?? '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}
