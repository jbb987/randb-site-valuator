import { useState } from 'react';
import Layout from '../components/Layout';
import BroadbandReport from '../components/broadband/BroadbandReport';
import RecentHistory from '../components/RecentHistory';
import SiteSelector from '../components/SiteSelector';
import type { SiteSelectorSite } from '../components/SiteSelector';
import { useBroadbandLookup } from '../hooks/useBroadbandLookup';
import { useSiteRegistry } from '../hooks/useSiteRegistry';
import { useUserHistory } from '../hooks/useUserHistory';
import { saveBroadbandToSite } from '../lib/siteRegistry';

export default function BroadbandLookupTool() {
  const [coordinates, setCoordinates] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const { loading, error, result, lookup, clear } = useBroadbandLookup();
  const { sites: registrySites, loading: sitesLoading } = useSiteRegistry();
  const { logActivity, getToolHistory, loading: historyLoading } = useUserHistory();
  const recentEntries = getToolHistory('broadband-lookup');

  const canAnalyze = coordinates.trim().length > 0;

  const handleAnalyze = async () => {
    if (!canAnalyze) return;
    const res = await lookup({ coordinates: coordinates.trim() });

    // Log to history
    if (res) {
      logActivity('broadband-lookup', '', coordinates.trim(), 'Broadband lookup', selectedSiteId ?? undefined, {
        coordinates: coordinates.trim(),
      });
    }

    // Write back to site registry if a site is selected
    if (res && selectedSiteId) {
      void saveBroadbandToSite(selectedSiteId, res).then(
        () => console.log('[BroadbandLookup] Results saved to site registry'),
        (err) => console.error('[BroadbandLookup] Failed to save results:', err),
      );
    }
  };

  const handleClear = () => {
    setCoordinates('');
    clear();
  };

  const handleSiteSelect = (site: SiteSelectorSite) => {
    setSelectedSiteId(site.id);
    if (site.coordinates) {
      setCoordinates(`${site.coordinates.lat}, ${site.coordinates.lng}`);
    }
  };

  const handleSiteClear = () => {
    setSelectedSiteId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canAnalyze && !loading) handleAnalyze();
  };

  const handleReplay = (inputs: Record<string, unknown>) => {
    const coords = inputs.coordinates as string | undefined;
    if (coords) {
      setCoordinates(coords);
      lookup({ coordinates: coords });
    }
  };

  return (
    <Layout>
      <main className="py-6">
        {/* Site Selector */}
        <SiteSelector
          sites={registrySites}
          loading={sitesLoading}
          selectedSiteId={selectedSiteId}
          onSelect={handleSiteSelect}
          onClear={handleSiteClear}
        />

        {/* Header */}
        <div className="mb-6">
          <h2 className="font-heading text-2xl font-semibold text-[#201F1E]">
            Broadband Data Lookup
          </h2>
          <p className="text-sm text-[#7A756E] mt-0.5">
            Enter site coordinates to generate a broadband due diligence report.
          </p>
        </div>

        {/* Input Card */}
        <div className="bg-white rounded-2xl border border-[#D8D5D0] p-5 md:p-6 mb-6">
          <h3 className="font-heading text-base font-semibold text-[#201F1E] mb-4">
            Site Location
          </h3>

          <div className="flex gap-3">
            <input
              type="text"
              value={coordinates}
              onChange={(e) => setCoordinates(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={'Decimal (28.44, -99.75) or DMS (28\u00B039\'22.0"N 98\u00B050\'38.3"W)'}
              className="flex-1 rounded-lg border border-[#D8D5D0] bg-white px-3 py-2.5 text-sm text-[#201F1E] placeholder:text-[#7A756E]/50 focus:border-[#ED202B] focus:ring-2 focus:ring-[#ED202B]/20 focus:outline-none transition"
            />

            <button
              type="button"
              onClick={handleAnalyze}
              disabled={!canAnalyze || loading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#ED202B] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#9B0E18] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Analyzing...
                </>
              ) : (
                'Analyze'
              )}
            </button>

            {result && (
              <button
                type="button"
                onClick={handleClear}
                className="rounded-lg border border-[#D8D5D0] bg-white px-3 py-2.5 text-sm text-[#7A756E] hover:bg-[#F5F4F2] transition"
              >
                Clear
              </button>
            )}
          </div>

          {error && (
            <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Results */}
        {result && <BroadbandReport result={result} />}

        {/* Empty state with recent history */}
        {!result && !loading && (
          <RecentHistory
            entries={recentEntries}
            loading={historyLoading}
            icon={
              <svg className="h-8 w-8 text-[#ED202B]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
              </svg>
            }
            emptyMessage={
              <p>Enter coordinates above and click <strong>Analyze</strong> to generate a broadband due diligence report.</p>
            }
            onReplay={handleReplay}
          />
        )}
      </main>
    </Layout>
  );
}
