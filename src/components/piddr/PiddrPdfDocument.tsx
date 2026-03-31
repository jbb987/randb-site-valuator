import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  Font,
} from '@react-pdf/renderer';
import type { AppraisalResult, BroadbandResult } from '../../types';
import type { InfrastructureData } from '../power-calculator/InfrastructureResults';
import type { PiddrInputs } from '../../hooks/usePiddrReport';

// ── Font Registration ──────────────────────────────────────────────────────
try {
  Font.register({
    family: 'Sora',
    fonts: [
      { src: 'https://fonts.gstatic.com/s/sora/v12/xMQOuFFYT72X5wkB_18qmnndmSdSnk-DKQRDA2MYsKE.ttf', fontWeight: 400 },
      { src: 'https://fonts.gstatic.com/s/sora/v12/xMQOuFFYT72X5wkB_18qmnndmSdSnk-NKgRDA2MYsKE.ttf', fontWeight: 600 },
      { src: 'https://fonts.gstatic.com/s/sora/v12/xMQOuFFYT72X5wkB_18qmnndmSdSnk-0KgRDA2MYsKE.ttf', fontWeight: 700 },
    ],
  });
  Font.register({
    family: 'IBMPlexSans',
    fonts: [
      { src: 'https://fonts.gstatic.com/s/ibmplexsans/v19/zYXgKVElMYYaJe8bpLHnCwDKtdbUFI5NadY.ttf', fontWeight: 300 },
      { src: 'https://fonts.gstatic.com/s/ibmplexsans/v19/zYXgKVElMYYaJe8bpLHnCwDKhdPUFI5NadY.ttf', fontWeight: 400 },
      { src: 'https://fonts.gstatic.com/s/ibmplexsans/v19/zYXgKVElMYYaJe8bpLHnCwDKjdDUFI5NadY.ttf', fontWeight: 500 },
      { src: 'https://fonts.gstatic.com/s/ibmplexsans/v19/zYXgKVElMYYaJe8bpLHnCwDKodXUFI5NadY.ttf', fontWeight: 600 },
    ],
  });
} catch {
  // Fallback to Helvetica if font registration fails
}

// ── Helpers ────────────────────────────────────────────────────────────────
const BRAND_RED = '#ED202B';
const BRAND_DARK = '#9B0E18';
const TEXT_PRIMARY = '#201F1E';
const TEXT_MUTED = '#7A756E';
const BORDER = '#D8D5D0';
const TABLE_HEADER_BG = '#F5F4F3';
const TABLE_ALT_ROW = '#FAFAF9';

const heading = { fontFamily: 'Sora' as const };
const body = { fontFamily: 'IBMPlexSans' as const };

function fmt$(n: number): string {
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtNum(n: number, decimals = 1): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: decimals });
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── Styles ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    paddingTop: 60,
    paddingBottom: 60,
    paddingHorizontal: 50,
    ...body,
    color: TEXT_PRIMARY,
    fontSize: 9,
    lineHeight: 1.5,
  },
  // Header (non-cover pages)
  pageHeader: {
    position: 'absolute',
    top: 20,
    left: 50,
    right: 50,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
  },
  pageHeaderLeft: { fontSize: 7, color: TEXT_MUTED, ...body },
  pageHeaderRight: { fontSize: 7, color: TEXT_MUTED, ...body },
  // Footer
  pageFooter: {
    position: 'absolute',
    bottom: 20,
    left: 50,
    right: 50,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopColor: BORDER,
    paddingTop: 6,
  },
  footerBrand: { fontSize: 7, fontWeight: 600, color: BRAND_RED, ...heading },
  footerPage: { fontSize: 7, color: TEXT_MUTED, ...body },
  footerConfidential: { fontSize: 6, color: TEXT_MUTED, ...body },
  // Cover
  coverPage: {
    paddingHorizontal: 50,
    paddingVertical: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  coverBrandBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: BRAND_RED,
  },
  coverBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: BRAND_RED,
  },
  coverTitle: {
    ...heading,
    fontSize: 28,
    fontWeight: 700,
    color: BRAND_RED,
    textAlign: 'center',
    marginBottom: 6,
  },
  coverSubtitle: {
    ...heading,
    fontSize: 11,
    fontWeight: 400,
    color: TEXT_MUTED,
    textAlign: 'center',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 40,
  },
  coverSiteName: {
    ...heading,
    fontSize: 22,
    fontWeight: 600,
    color: TEXT_PRIMARY,
    textAlign: 'center',
    marginBottom: 10,
  },
  coverAddress: {
    ...body,
    fontSize: 11,
    color: TEXT_MUTED,
    textAlign: 'center',
    marginBottom: 4,
  },
  coverDate: {
    ...body,
    fontSize: 10,
    color: TEXT_MUTED,
    textAlign: 'center',
    marginTop: 30,
  },
  coverConfidential: {
    position: 'absolute',
    bottom: 30,
    left: 50,
    right: 50,
    textAlign: 'center',
    ...body,
    fontSize: 8,
    fontWeight: 600,
    color: BRAND_DARK,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  coverDivider: {
    width: 60,
    height: 2,
    backgroundColor: BRAND_RED,
    marginBottom: 30,
    alignSelf: 'center',
  },
  // Section headings
  sectionTitle: {
    ...heading,
    fontSize: 16,
    fontWeight: 700,
    color: BRAND_RED,
    marginBottom: 14,
    paddingBottom: 6,
    borderBottomWidth: 1.5,
    borderBottomColor: BRAND_RED,
  },
  subsectionTitle: {
    ...heading,
    fontSize: 11,
    fontWeight: 600,
    color: TEXT_PRIMARY,
    marginBottom: 8,
    marginTop: 16,
  },
  // Key-value rows
  kvRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: '#EEEDE9',
  },
  kvLabel: { width: '45%', fontSize: 8.5, color: TEXT_MUTED, ...body },
  kvValue: { width: '55%', fontSize: 9, fontWeight: 500, color: TEXT_PRIMARY, ...body },
  // Tables
  table: { marginTop: 6, marginBottom: 8, borderWidth: 0.5, borderColor: BORDER },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: TABLE_HEADER_BG,
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#EEEDE9',
  },
  tableRowAlt: { backgroundColor: TABLE_ALT_ROW },
  tableHeaderCell: { fontSize: 7, fontWeight: 600, color: TEXT_PRIMARY, ...heading, textTransform: 'uppercase', letterSpacing: 0.5 },
  tableCell: { fontSize: 8, color: TEXT_PRIMARY, ...body },
  // Executive summary
  summaryBox: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 4,
    padding: 14,
    marginBottom: 16,
    backgroundColor: '#FEFEFE',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: '#EEEDE9',
  },
  summaryLabel: { fontSize: 9, color: TEXT_MUTED, ...body },
  summaryValue: { fontSize: 9, fontWeight: 600, color: TEXT_PRIMARY, ...body },
  summaryHighlight: { fontSize: 9, fontWeight: 600, color: BRAND_RED, ...body },
  // Badge
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    fontSize: 7,
    fontWeight: 600,
    ...heading,
  },
  badgeGreen: { backgroundColor: '#ECFDF5', color: '#065F46' },
  badgeAmber: { backgroundColor: '#FFFBEB', color: '#92400E' },
  badgeRed: { backgroundColor: '#FEF2F2', color: '#991B1B' },
  badgeGray: { backgroundColor: '#F5F5F4', color: '#57534E' },
  // Misc
  paragraph: { ...body, fontSize: 9, color: TEXT_PRIMARY, lineHeight: 1.6, marginBottom: 8 },
  noteText: { ...body, fontSize: 7.5, color: TEXT_MUTED, marginTop: 4 },
  noData: { ...body, fontSize: 8.5, color: TEXT_MUTED, marginVertical: 6 },
});

// ── Data Props ─────────────────────────────────────────────────────────────
export interface PiddrPdfData {
  inputs: PiddrInputs;
  appraisal: AppraisalResult | null;
  infra: InfrastructureData | null;
  broadband: BroadbandResult | null;
  generatedAt: number;
}

// ── Shared Components ──────────────────────────────────────────────────────
function PageHeader({ siteName }: { siteName: string }) {
  return (
    <View style={s.pageHeader} fixed>
      <Text style={s.pageHeaderLeft}>{siteName}</Text>
      <Text style={s.pageHeaderRight}>Power Infrastructure Due Diligence Report</Text>
    </View>
  );
}

function PageFooter() {
  return (
    <View style={s.pageFooter} fixed>
      <Text style={s.footerBrand}>R&B Power</Text>
      <Text style={s.footerConfidential}>CONFIDENTIAL — For Internal Use Only</Text>
      <Text style={s.footerPage} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function KvRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.kvRow}>
      <Text style={s.kvLabel}>{label}</Text>
      <Text style={s.kvValue}>{value}</Text>
    </View>
  );
}

function ghiRating(ghi: number): { label: string; style: typeof s.badgeGreen } {
  if (ghi >= 5.0) return { label: 'Excellent', style: s.badgeGreen };
  if (ghi >= 4.5) return { label: 'Good', style: s.badgeGreen };
  if (ghi >= 4.0) return { label: 'Fair', style: s.badgeAmber };
  return { label: 'Poor', style: s.badgeRed };
}

// ── Cover Page ─────────────────────────────────────────────────────────────
function CoverPage({ data }: { data: PiddrPdfData }) {
  return (
    <Page size="LETTER" style={s.coverPage}>
      <View style={s.coverBrandBar} />
      <View style={{ alignItems: 'center' }}>
        <Text style={s.coverSubtitle}>R&B Power</Text>
        <View style={s.coverDivider} />
        <Text style={s.coverTitle}>Power Infrastructure{'\n'}Due Diligence Report</Text>
        <View style={{ height: 30 }} />
        <Text style={s.coverSiteName}>{data.inputs.siteName}</Text>
        {data.inputs.address ? <Text style={s.coverAddress}>{data.inputs.address}</Text> : null}
        {data.inputs.coordinates ? <Text style={s.coverAddress}>{data.inputs.coordinates}</Text> : null}
        <Text style={s.coverDate}>{fmtDate(data.generatedAt)}</Text>
      </View>
      <Text style={s.coverConfidential}>Confidential — For Internal Use Only</Text>
      <View style={s.coverBottomBar} />
    </Page>
  );
}

// ── Executive Summary ──────────────────────────────────────────────────────
function ExecSummaryPage({ data }: { data: PiddrPdfData }) {
  const { appraisal, infra, broadband, inputs } = data;
  const solar = infra?.solarWind;
  const ghiInfo = solar ? ghiRating(solar.ghi) : null;

  return (
    <Page size="LETTER" style={s.page}>
      <PageHeader siteName={inputs.siteName} />
      <Text style={s.sectionTitle}>Executive Summary</Text>

      <Text style={s.paragraph}>
        This report presents a comprehensive due diligence analysis for {inputs.siteName}, evaluating land valuation,
        power infrastructure availability, solar and wind resource potential, and broadband connectivity.
        Key findings are summarized below.
      </Text>

      <View style={s.summaryBox}>
        <Text style={[s.subsectionTitle, { marginTop: 0, marginBottom: 10 }]}>Key Metrics</Text>

        <View style={s.summaryRow}>
          <Text style={s.summaryLabel}>Site Capacity</Text>
          <Text style={s.summaryValue}>{inputs.mw} MW</Text>
        </View>
        <View style={s.summaryRow}>
          <Text style={s.summaryLabel}>Acreage</Text>
          <Text style={s.summaryValue}>{fmtNum(inputs.acreage, 0)} acres</Text>
        </View>

        {appraisal && (
          <>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>Current Land Value</Text>
              <Text style={s.summaryValue}>
                {fmt$(appraisal.currentValueLow)} — {fmt$(appraisal.currentValueHigh)}
              </Text>
            </View>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>Energized Value</Text>
              <Text style={s.summaryHighlight}>{fmt$(appraisal.energizedValue)}</Text>
            </View>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>Return Multiple</Text>
              <Text style={s.summaryHighlight}>{appraisal.returnMultiple.toFixed(1)}x</Text>
            </View>
          </>
        )}

        {infra && (
          <>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>ISO / RTO</Text>
              <Text style={s.summaryValue}>{infra.iso}</Text>
            </View>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>Nearest POI</Text>
              <Text style={s.summaryValue}>
                {infra.nearestPoiName ? `${infra.nearestPoiName} (${fmtNum(infra.nearestPoiDistMi)} mi)` : 'N/A'}
              </Text>
            </View>
          </>
        )}

        {solar && ghiInfo && (
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Solar Resource (GHI)</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={s.summaryValue}>{solar.ghi.toFixed(1)} kWh/m²/day</Text>
              <Text style={[s.badge, ghiInfo.style]}>{ghiInfo.label}</Text>
            </View>
          </View>
        )}

        {broadband && (
          <>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>Fiber Available</Text>
              <Text style={[s.badge, broadband.fiberAvailable ? s.badgeGreen : s.badgeRed]}>
                {broadband.fiberAvailable ? 'Yes' : 'No'}
              </Text>
            </View>
            <View style={[s.summaryRow, { borderBottomWidth: 0 }]}>
              <Text style={s.summaryLabel}>Max Download Speed</Text>
              <Text style={s.summaryValue}>{fmtNum(broadband.maxDownload, 0)} Mbps</Text>
            </View>
          </>
        )}
      </View>

      <PageFooter />
    </Page>
  );
}

// ── Site Overview ──────────────────────────────────────────────────────────
function SiteOverviewPage({ data }: { data: PiddrPdfData }) {
  const { inputs } = data;
  return (
    <Page size="LETTER" style={s.page}>
      <PageHeader siteName={inputs.siteName} />
      <Text style={s.sectionTitle}>Site Overview</Text>

      <KvRow label="Site Name" value={inputs.siteName} />
      {inputs.address ? <KvRow label="Address" value={inputs.address} /> : null}
      {inputs.coordinates ? <KvRow label="Coordinates" value={inputs.coordinates} /> : null}
      <KvRow label="Acreage" value={`${fmtNum(inputs.acreage, 0)} acres`} />
      <KvRow label="MW Capacity" value={`${inputs.mw} MW`} />
      <KvRow label="Land Comp (Low)" value={inputs.ppaLow ? `${fmt$(inputs.ppaLow)} / acre` : 'Not provided'} />
      <KvRow label="Land Comp (High)" value={inputs.ppaHigh ? `${fmt$(inputs.ppaHigh)} / acre` : 'Not provided'} />

      <PageFooter />
    </Page>
  );
}

// ── Land Valuation ─────────────────────────────────────────────────────────
function LandValuationPage({ data }: { data: PiddrPdfData }) {
  const { appraisal, inputs } = data;
  if (!appraisal) return null;

  const mid = (appraisal.currentValueLow + appraisal.currentValueHigh) / 2;

  return (
    <Page size="LETTER" style={s.page}>
      <PageHeader siteName={inputs.siteName} />
      <Text style={s.sectionTitle}>Land Valuation</Text>

      <Text style={s.subsectionTitle}>Current Land Value</Text>
      <KvRow label="Low Estimate" value={fmt$(appraisal.currentValueLow)} />
      <KvRow label="High Estimate" value={fmt$(appraisal.currentValueHigh)} />
      <KvRow label="Midpoint" value={fmt$(mid)} />
      {inputs.acreage > 0 && (
        <KvRow label="Per Acre (Mid)" value={fmt$(mid / inputs.acreage)} />
      )}

      <Text style={s.subsectionTitle}>Energized Value</Text>
      <KvRow label="Energized Value" value={fmt$(appraisal.energizedValue)} />
      <KvRow label="Value Created" value={fmt$(appraisal.valueCreated)} />
      <KvRow label="Return Multiple" value={`${appraisal.returnMultiple.toFixed(1)}x`} />
      {inputs.acreage > 0 && (
        <KvRow label="Energized Value per Acre" value={fmt$(appraisal.energizedValue / inputs.acreage)} />
      )}

      <Text style={s.subsectionTitle}>Key Assumptions</Text>
      <Text style={s.paragraph}>
        {'\u2022'} Value per MW: $3,000,000{'\n'}
        {'\u2022'} Site Capacity: {inputs.mw} MW{'\n'}
        {'\u2022'} Total Acreage: {fmtNum(inputs.acreage, 0)} acres{'\n'}
        {'\u2022'} Land Comparables Range: {fmt$(inputs.ppaLow)} — {fmt$(inputs.ppaHigh)} per acre
      </Text>

      <PageFooter />
    </Page>
  );
}

// ── Power Infrastructure ───────────────────────────────────────────────────
function InfrastructurePages({ data }: { data: PiddrPdfData }) {
  const { infra, inputs } = data;
  if (!infra) return null;

  const substations = infra.nearbySubstations ?? [];
  const lines = infra.nearbyLines ?? [];
  const plants = infra.nearbyPowerPlants ?? [];

  return (
    <>
      {/* Infrastructure Page 1: Territory, POI, Substations, Lines */}
      <Page size="LETTER" style={s.page}>
        <PageHeader siteName={inputs.siteName} />
        <Text style={s.sectionTitle}>Power Infrastructure</Text>

        <Text style={s.subsectionTitle}>Territory</Text>
        <KvRow label="ISO / RTO" value={infra.iso} />
        <KvRow label="Utility Territory" value={infra.utilityTerritory} />
        <KvRow label="Transmission Service Provider" value={infra.tsp} />

        <Text style={s.subsectionTitle}>Point of Interconnection</Text>
        {infra.nearestPoiName ? (
          <>
            <KvRow label="Nearest POI" value={infra.nearestPoiName} />
            <KvRow label="Distance" value={`${fmtNum(infra.nearestPoiDistMi)} miles`} />
          </>
        ) : (
          <Text style={s.noData}>No POI data available</Text>
        )}

        {/* Flood Zone */}
        {infra.floodZone && (
          <>
            <Text style={s.subsectionTitle}>FEMA Flood Zone</Text>
            <KvRow label="Zone" value={infra.floodZone.zone} />
            {infra.floodZone.floodwayType && infra.floodZone.floodwayType !== 'None' && (
              <KvRow label="Floodway" value={infra.floodZone.floodwayType} />
            )}
          </>
        )}

        {/* Substations Table */}
        <Text style={s.subsectionTitle}>Nearby Substations ({substations.length})</Text>
        {substations.length > 0 ? (
          <View style={s.table}>
            <View style={s.tableHeaderRow}>
              <Text style={[s.tableHeaderCell, { width: '28%' }]}>Name</Text>
              <Text style={[s.tableHeaderCell, { width: '22%' }]}>Owner</Text>
              <Text style={[s.tableHeaderCell, { width: '15%' }]}>Max kV</Text>
              <Text style={[s.tableHeaderCell, { width: '10%' }]}>Lines</Text>
              <Text style={[s.tableHeaderCell, { width: '12%' }]}>Dist (mi)</Text>
              <Text style={[s.tableHeaderCell, { width: '13%' }]}>Status</Text>
            </View>
            {substations.slice(0, 15).map((sub, i) => (
              <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                <Text style={[s.tableCell, { width: '28%' }]}>{sub.name || 'Unknown'}</Text>
                <Text style={[s.tableCell, { width: '22%' }]}>{sub.owner || '—'}</Text>
                <Text style={[s.tableCell, { width: '15%' }]}>{fmtNum(sub.maxVolt, 0)}</Text>
                <Text style={[s.tableCell, { width: '10%' }]}>{sub.lines}</Text>
                <Text style={[s.tableCell, { width: '12%' }]}>{fmtNum(sub.distanceMi)}</Text>
                <Text style={[s.tableCell, { width: '13%' }]}>{sub.status}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={s.noData}>No nearby substations found</Text>
        )}

        <PageFooter />
      </Page>

      {/* Infrastructure Page 2: Transmission Lines, Power Plants, Solar/Wind, Electricity */}
      <Page size="LETTER" style={s.page}>
        <PageHeader siteName={inputs.siteName} />
        <Text style={[s.sectionTitle, { fontSize: 14 }]}>Power Infrastructure (continued)</Text>

        {/* Transmission Lines */}
        <Text style={s.subsectionTitle}>Nearby Transmission Lines ({lines.length})</Text>
        {lines.length > 0 ? (
          <View style={s.table}>
            <View style={s.tableHeaderRow}>
              <Text style={[s.tableHeaderCell, { width: '25%' }]}>Owner</Text>
              <Text style={[s.tableHeaderCell, { width: '12%' }]}>kV</Text>
              <Text style={[s.tableHeaderCell, { width: '23%' }]}>From</Text>
              <Text style={[s.tableHeaderCell, { width: '23%' }]}>To</Text>
              <Text style={[s.tableHeaderCell, { width: '17%' }]}>Status</Text>
            </View>
            {lines.slice(0, 15).map((line, i) => (
              <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                <Text style={[s.tableCell, { width: '25%' }]}>{line.owner || '—'}</Text>
                <Text style={[s.tableCell, { width: '12%' }]}>{fmtNum(line.voltage, 0)}</Text>
                <Text style={[s.tableCell, { width: '23%' }]}>{line.sub1 || '—'}</Text>
                <Text style={[s.tableCell, { width: '23%' }]}>{line.sub2 || '—'}</Text>
                <Text style={[s.tableCell, { width: '17%' }]}>{line.status}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={s.noData}>No nearby transmission lines found</Text>
        )}

        {/* Power Plants */}
        <Text style={s.subsectionTitle}>Nearby Power Plants ({plants.length})</Text>
        {plants.length > 0 ? (
          <View style={s.table}>
            <View style={s.tableHeaderRow}>
              <Text style={[s.tableHeaderCell, { width: '25%' }]}>Name</Text>
              <Text style={[s.tableHeaderCell, { width: '22%' }]}>Operator</Text>
              <Text style={[s.tableHeaderCell, { width: '17%' }]}>Source</Text>
              <Text style={[s.tableHeaderCell, { width: '12%' }]}>MW</Text>
              <Text style={[s.tableHeaderCell, { width: '12%' }]}>Dist (mi)</Text>
              <Text style={[s.tableHeaderCell, { width: '12%' }]}>Status</Text>
            </View>
            {plants.slice(0, 15).map((plant, i) => (
              <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                <Text style={[s.tableCell, { width: '25%' }]}>{plant.name}</Text>
                <Text style={[s.tableCell, { width: '22%' }]}>{plant.operator || '—'}</Text>
                <Text style={[s.tableCell, { width: '17%' }]}>{plant.primarySource}</Text>
                <Text style={[s.tableCell, { width: '12%' }]}>{fmtNum(plant.capacityMW, 0)}</Text>
                <Text style={[s.tableCell, { width: '12%' }]}>{fmtNum(plant.distanceMi)}</Text>
                <Text style={[s.tableCell, { width: '12%' }]}>{plant.status}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={s.noData}>No nearby power plants found</Text>
        )}

        {/* Solar & Wind Resource */}
        {infra.solarWind && (
          <>
            <Text style={s.subsectionTitle}>Solar & Wind Resource</Text>
            <KvRow label="Global Horizontal Irradiance (GHI)" value={`${infra.solarWind.ghi.toFixed(2)} kWh/m\u00B2/day`} />
            <KvRow label="Direct Normal Irradiance (DNI)" value={`${infra.solarWind.dni.toFixed(2)} kWh/m\u00B2/day`} />
            <KvRow label="Wind Speed (hub height)" value={`${infra.solarWind.windSpeed.toFixed(1)} m/s`} />
            <KvRow label="Est. Capacity Factor" value={`${infra.solarWind.capacity.toFixed(1)}%`} />
          </>
        )}

        {/* Electricity Prices */}
        {infra.electricityPrice && (
          <>
            <Text style={s.subsectionTitle}>Electricity Prices{infra.detectedState ? ` (${infra.detectedState})` : ''}</Text>
            <KvRow label="Commercial" value={`${infra.electricityPrice.commercial.toFixed(2)} \u00A2/kWh`} />
            <KvRow label="Industrial" value={`${infra.electricityPrice.industrial.toFixed(2)} \u00A2/kWh`} />
            <KvRow label="All Sectors" value={`${infra.electricityPrice.allSectors.toFixed(2)} \u00A2/kWh`} />
          </>
        )}

        <PageFooter />
      </Page>
    </>
  );
}

// ── Broadband & Connectivity ───────────────────────────────────────────────
function BroadbandPage({ data }: { data: PiddrPdfData }) {
  const { broadband, inputs } = data;
  if (!broadband) return null;

  const providers = broadband.providers ?? [];
  const fiberRoutes = broadband.nearbyFiberRoutes ?? [];
  const mobileProviders = broadband.mobileProviders ?? [];

  return (
    <Page size="LETTER" style={s.page}>
      <PageHeader siteName={inputs.siteName} />
      <Text style={s.sectionTitle}>Broadband & Connectivity</Text>

      <Text style={s.subsectionTitle}>Overview</Text>
      <KvRow label="Connectivity Tier" value={broadband.tier} />
      <KvRow label="Total Providers" value={String(broadband.totalProviders)} />
      <KvRow label="Fiber Available" value={broadband.fiberAvailable ? 'Yes' : 'No'} />
      <KvRow label="Cable Available" value={broadband.cableAvailable ? 'Yes' : 'No'} />
      <KvRow label="Fixed Wireless Available" value={broadband.fixedWirelessAvailable ? 'Yes' : 'No'} />
      <KvRow label="Max Download" value={`${fmtNum(broadband.maxDownload, 0)} Mbps`} />
      <KvRow label="Max Upload" value={`${fmtNum(broadband.maxUpload, 0)} Mbps`} />

      {/* Fixed Broadband Providers Table */}
      <Text style={s.subsectionTitle}>Fixed Broadband Providers ({providers.length})</Text>
      {providers.length > 0 ? (
        <View style={s.table}>
          <View style={s.tableHeaderRow}>
            <Text style={[s.tableHeaderCell, { width: '30%' }]}>Provider</Text>
            <Text style={[s.tableHeaderCell, { width: '20%' }]}>Technology</Text>
            <Text style={[s.tableHeaderCell, { width: '15%' }]}>Down (Mbps)</Text>
            <Text style={[s.tableHeaderCell, { width: '15%' }]}>Up (Mbps)</Text>
            <Text style={[s.tableHeaderCell, { width: '20%' }]}>Low Latency</Text>
          </View>
          {providers.slice(0, 20).map((p, i) => (
            <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
              <Text style={[s.tableCell, { width: '30%' }]}>{p.providerName}</Text>
              <Text style={[s.tableCell, { width: '20%' }]}>{p.technology}</Text>
              <Text style={[s.tableCell, { width: '15%' }]}>{fmtNum(p.maxDown, 0)}</Text>
              <Text style={[s.tableCell, { width: '15%' }]}>{fmtNum(p.maxUp, 0)}</Text>
              <Text style={[s.tableCell, { width: '20%' }]}>{p.lowLatency ? 'Yes' : 'No'}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={s.noData}>No fixed broadband providers found at this location</Text>
      )}

      {/* Mobile Broadband */}
      {mobileProviders.length > 0 && (
        <>
          <Text style={s.subsectionTitle}>Mobile Broadband Coverage ({mobileProviders.length})</Text>
          <View style={s.table}>
            <View style={s.tableHeaderRow}>
              <Text style={[s.tableHeaderCell, { width: '35%' }]}>Provider</Text>
              <Text style={[s.tableHeaderCell, { width: '25%' }]}>Technology</Text>
              <Text style={[s.tableHeaderCell, { width: '20%' }]}>Down (Mbps)</Text>
              <Text style={[s.tableHeaderCell, { width: '20%' }]}>Up (Mbps)</Text>
            </View>
            {mobileProviders.slice(0, 15).map((p, i) => (
              <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                <Text style={[s.tableCell, { width: '35%' }]}>{p.providerName}</Text>
                <Text style={[s.tableCell, { width: '25%' }]}>{p.technology}</Text>
                <Text style={[s.tableCell, { width: '20%' }]}>{fmtNum(p.maxDown, 0)}</Text>
                <Text style={[s.tableCell, { width: '20%' }]}>{fmtNum(p.maxUp, 0)}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* Fiber Routes */}
      {fiberRoutes.length > 0 && (
        <>
          <Text style={s.subsectionTitle}>Nearby Fiber Routes ({fiberRoutes.length})</Text>
          <View style={s.table}>
            <View style={s.tableHeaderRow}>
              <Text style={[s.tableHeaderCell, { width: '30%' }]}>Name</Text>
              <Text style={[s.tableHeaderCell, { width: '25%' }]}>Owner</Text>
              <Text style={[s.tableHeaderCell, { width: '20%' }]}>Type</Text>
              <Text style={[s.tableHeaderCell, { width: '25%' }]}>Distance (mi)</Text>
            </View>
            {fiberRoutes.map((r, i) => (
              <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                <Text style={[s.tableCell, { width: '30%' }]}>{r.name}</Text>
                <Text style={[s.tableCell, { width: '25%' }]}>{r.owner}</Text>
                <Text style={[s.tableCell, { width: '20%' }]}>{r.type}</Text>
                <Text style={[s.tableCell, { width: '25%' }]}>{fmtNum(r.distanceMi)}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <PageFooter />
    </Page>
  );
}

// ── Main Document ──────────────────────────────────────────────────────────
export default function PiddrPdfDocument({ data }: { data: PiddrPdfData }) {
  return (
    <Document
      title={`PIDDR — ${data.inputs.siteName}`}
      author="R&B Power"
      subject="Power Infrastructure Due Diligence Report"
      creator="R&B Power Platform"
    >
      <CoverPage data={data} />
      <ExecSummaryPage data={data} />
      <SiteOverviewPage data={data} />
      <LandValuationPage data={data} />
      <InfrastructurePages data={data} />
      <BroadbandPage data={data} />
    </Document>
  );
}
