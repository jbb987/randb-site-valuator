/**
 * Labor Pool Analysis — Phase 1 (county-anchored)
 *
 * Live data sources:
 * - Census Geocoder (coords → county FIPS + CBSA/MSA) — no key
 * - Census ACS 5yr API — VITE_CENSUS_API_KEY optional (50/day without)
 *
 * Stubbed sources (mock until BLS key wired):
 * - BLS QCEW open-data CSV (industry employment + wages, county)
 * - BLS LAUS public API (monthly unemployment rate, county)
 * - BLS OEWS public API (occupational wages, MSA → state fallback)
 *
 * The function fetches what it can and falls back to seed mock data for
 * any source that fails or is not yet wired. Per-source error flags on
 * the result let the UI report partial coverage honestly.
 */

import { detectStateFromCoords } from './solarAverages';
import { geocodeAddress } from './infraLookup';
import { cachedFetch, TTL_LOCATION } from './requestCache';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ResolvedCounty {
  fips: string;        // 5-digit county FIPS (e.g. "48127")
  name: string;        // "Dimmit County"
  state: string;       // 2-letter state abbr
}

export interface ResolvedMsa {
  code: string;        // 5-digit CBSA code
  name: string;        // "Eagle Pass, TX"
}

export interface PopulationStats {
  total: number;
  workingAge16Plus: number;
}

export interface LaborForceStats {
  total: number;
  employed: number;
  unemployed: number;
  participationRate: number;  // 0–1
}

export interface UnemploymentStats {
  current: number;     // percent (e.g. 8.7)
  vintage: string;     // human label like "Oct 2025"
}

export interface AgeBands {
  '16-24': number;
  '25-44': number;
  '45-64': number;
  '65+': number;
}

export interface EducationDistribution {
  noHs: number;
  hs: number;
  someCollege: number;
  associate: number;
  bachelor: number;
  graduate: number;
}

export interface IndustryRow {
  naicsCode: string;
  naicsName: string;
  employed: number;
  avgWeeklyWage: number | null;
  establishments: number | null;
}

export interface OccupationRow {
  socCode: string;
  socName: string;
  employed: number | null;
  wages: { p10: number; p25: number; p50: number; p75: number; p90: number } | null;
  geographyUsed: 'msa' | 'state' | 'national';
  suppressed: boolean;
}

export interface CommuteStats {
  meanTravelTimeMinutes: number;
  modeShare: { car: number; carpool: number; transit: number; wfh: number; other: number };
}

export interface LaborBenchmark {
  laborForceParticipationRate: number;
  unemploymentRate: number;
  medianHouseholdIncome: number;
  educationBachelorPlus: number;
}

export interface LaborVintages {
  acs: string;
  qcew: string;
  oews: string;
  laus: string;
}

export interface LaborAnalysisResult {
  // Geographic resolution
  resolvedCounty: ResolvedCounty | null;
  resolvedMsa: ResolvedMsa | null;
  detectedState: string | null;

  // Pool
  population: PopulationStats;
  laborForce: LaborForceStats;
  unemploymentRate: UnemploymentStats;

  // Composition
  ageBands: AgeBands;
  education: EducationDistribution;
  medianHouseholdIncome: number;

  // Industry & occupation
  industries: IndustryRow[];
  wagesByOccupation: OccupationRow[];

  // Commute
  commute: CommuteStats;

  // Benchmarks (parallel to county-level fields, for self-judging UI)
  benchmarks: {
    state: LaborBenchmark;
    national: LaborBenchmark;
  };

  // Per-source vintages (drives the "Sources" footer)
  vintages: LaborVintages;

  // Site context
  lat: number;
  lng: number;
  timestamp: string;

  // Per-source error flags (partial-fetch tolerant, mirrors waterAnalysis)
  acsError?: string;
  qcewError?: string;
  oewsError?: string;
  lausError?: string;
}

// ── State-flavored seed data for the mock ───────────────────────────────────

interface CountySeed {
  county: ResolvedCounty;
  msa: ResolvedMsa | null;
  population: number;
  participationRate: number;
  unemploymentRate: number;
  medianIncome: number;
  topIndustries: Array<{ code: string; name: string; share: number; weeklyWage: number }>;
  topOccupations: Array<{ code: string; name: string; share: number; medianHourly: number }>;
  educationProfile: 'low' | 'mid' | 'high';
  meanCommuteMin: number;
}

/**
 * Default seeds for the mock. Real implementation replaces this with API data.
 * Numbers are illustrative but anchored to the source character of each region.
 */
const DEFAULT_SEED: CountySeed = {
  county: { fips: '48127', name: 'Dimmit County', state: 'TX' },
  msa: { code: '21340', name: 'Eagle Pass, TX' },
  population: 9870,
  participationRate: 0.55,
  unemploymentRate: 8.7,
  medianIncome: 48200,
  topIndustries: [
    { code: '21',    name: 'Mining / Oil & Gas Extraction', share: 0.26, weeklyWage: 1820 },
    { code: '23',    name: 'Construction',                   share: 0.14, weeklyWage: 1240 },
    { code: '61',    name: 'Educational Services',           share: 0.13, weeklyWage:  920 },
    { code: '44-45', name: 'Retail Trade',                   share: 0.10, weeklyWage:  640 },
    { code: '62',    name: 'Health Care',                    share: 0.08, weeklyWage:  890 },
    { code: '48-49', name: 'Transportation / Warehousing',   share: 0.07, weeklyWage: 1180 },
    { code: '72',    name: 'Accommodation / Food Services',  share: 0.06, weeklyWage:  470 },
    { code: '31-33', name: 'Manufacturing',                  share: 0.04, weeklyWage:  980 },
  ],
  topOccupations: [
    { code: '47-0000', name: 'Construction & Extraction',         share: 0.19, medianHourly: 22.40 },
    { code: '53-0000', name: 'Transportation & Material Moving',  share: 0.13, medianHourly: 19.80 },
    { code: '51-0000', name: 'Production',                        share: 0.10, medianHourly: 18.20 },
    { code: '43-0000', name: 'Office & Administrative Support',   share: 0.09, medianHourly: 17.10 },
    { code: '25-0000', name: 'Education / Training',              share: 0.08, medianHourly: 21.30 },
    { code: '41-0000', name: 'Sales & Related',                   share: 0.06, medianHourly: 15.80 },
    { code: '29-0000', name: 'Healthcare Practitioners',          share: 0.05, medianHourly: 28.60 },
    { code: '35-0000', name: 'Food Preparation & Serving',        share: 0.05, medianHourly: 12.40 },
  ],
  educationProfile: 'low',
  meanCommuteMin: 24.3,
};

const STATE_SEEDS: Partial<Record<string, Partial<CountySeed>>> = {
  // Lighter-touch overrides — only the fields that materially differ.
  // Real impl will populate every field from APIs; these are just to make
  // mock testing on different states look distinct.
  TX: { /* uses default */ },
  CA: {
    medianIncome: 89200,
    unemploymentRate: 4.9,
    participationRate: 0.64,
    educationProfile: 'high',
    meanCommuteMin: 31.4,
  },
  NY: {
    medianIncome: 81500,
    unemploymentRate: 4.2,
    participationRate: 0.62,
    educationProfile: 'high',
    meanCommuteMin: 33.1,
  },
  OK: {
    medianIncome: 56300,
    unemploymentRate: 3.6,
    participationRate: 0.62,
    educationProfile: 'mid',
    meanCommuteMin: 22.0,
  },
};

const NATIONAL_BENCHMARK: LaborBenchmark = {
  laborForceParticipationRate: 0.625,
  unemploymentRate: 4.1,
  medianHouseholdIncome: 78500,
  educationBachelorPlus: 0.355,
};

const STATE_BENCHMARKS: Record<string, LaborBenchmark> = {
  TX: { laborForceParticipationRate: 0.640, unemploymentRate: 4.0, medianHouseholdIncome: 76900, educationBachelorPlus: 0.318 },
  CA: { laborForceParticipationRate: 0.621, unemploymentRate: 5.3, medianHouseholdIncome: 95300, educationBachelorPlus: 0.367 },
  NY: { laborForceParticipationRate: 0.605, unemploymentRate: 4.4, medianHouseholdIncome: 84400, educationBachelorPlus: 0.395 },
  OK: { laborForceParticipationRate: 0.609, unemploymentRate: 3.4, medianHouseholdIncome: 60100, educationBachelorPlus: 0.270 },
  NM: { laborForceParticipationRate: 0.581, unemploymentRate: 4.6, medianHouseholdIncome: 58700, educationBachelorPlus: 0.295 },
  AZ: { laborForceParticipationRate: 0.610, unemploymentRate: 3.9, medianHouseholdIncome: 74600, educationBachelorPlus: 0.314 },
  TN: { laborForceParticipationRate: 0.609, unemploymentRate: 3.5, medianHouseholdIncome: 64000, educationBachelorPlus: 0.295 },
};

function educationDistFor(profile: 'low' | 'mid' | 'high'): EducationDistribution {
  if (profile === 'high') {
    return { noHs: 0.07, hs: 0.18, someCollege: 0.19, associate: 0.08, bachelor: 0.27, graduate: 0.21 };
  }
  if (profile === 'mid') {
    return { noHs: 0.11, hs: 0.28, someCollege: 0.24, associate: 0.09, bachelor: 0.18, graduate: 0.10 };
  }
  return { noHs: 0.29, hs: 0.34, someCollege: 0.21, associate: 0.05, bachelor: 0.08, graduate: 0.03 };
}

function ageBandsTypical(): AgeBands {
  return { '16-24': 0.16, '25-44': 0.39, '45-64': 0.31, '65+': 0.14 };
}

function modeShareTypical(profile: 'low' | 'mid' | 'high'): CommuteStats['modeShare'] {
  if (profile === 'high') return { car: 0.71, carpool: 0.08, transit: 0.09, wfh: 0.10, other: 0.02 };
  if (profile === 'mid')  return { car: 0.86, carpool: 0.07, transit: 0.02, wfh: 0.04, other: 0.01 };
  return                   { car: 0.91, carpool: 0.06, transit: 0.00, wfh: 0.02, other: 0.01 };
}

function pickWageGeography(state: string | null): 'msa' | 'state' | 'national' {
  // Mock: rural TX/OK/NM small MSAs frequently suppress, fall back to state.
  if (!state) return 'national';
  if (['TX', 'OK', 'NM'].includes(state)) return 'state';
  return 'msa';
}

// ── Mock builder ────────────────────────────────────────────────────────────

function buildMockResult(opts: {
  lat: number;
  lng: number;
  state: string | null;
}): LaborAnalysisResult {
  const { lat, lng, state } = opts;
  const overrides = (state && STATE_SEEDS[state]) ?? {};
  const seed: CountySeed = { ...DEFAULT_SEED, ...overrides };

  // If we have a real state, swap in a generic county/MSA label so the mock
  // doesn't claim Dimmit County for, say, a California site.
  const county: ResolvedCounty = state && state !== 'TX'
    ? { fips: '00000', name: 'County of record', state }
    : seed.county;

  const msa: ResolvedMsa | null = state && state !== 'TX'
    ? null
    : seed.msa;

  const totalPop = seed.population;
  const workingAge = Math.round(totalPop * 0.78);
  const laborForceTotal = Math.round(workingAge * seed.participationRate);
  const unemployed = Math.round(laborForceTotal * (seed.unemploymentRate / 100));
  const employed = laborForceTotal - unemployed;

  const industries: IndustryRow[] = seed.topIndustries.map((row) => ({
    naicsCode: row.code,
    naicsName: row.name,
    employed: Math.round(employed * row.share),
    avgWeeklyWage: row.weeklyWage,
    establishments: Math.max(1, Math.round((employed * row.share) / 18)),
  }));

  const wageGeo = pickWageGeography(state);
  const wagesByOccupation: OccupationRow[] = seed.topOccupations.map((row) => {
    const median = row.medianHourly;
    return {
      socCode: row.code,
      socName: row.name,
      employed: Math.round(employed * row.share),
      wages: {
        p10: +(median * 0.65).toFixed(2),
        p25: +(median * 0.82).toFixed(2),
        p50: +median.toFixed(2),
        p75: +(median * 1.22).toFixed(2),
        p90: +(median * 1.46).toFixed(2),
      },
      geographyUsed: wageGeo,
      suppressed: false,
    };
  });

  const benchmarkState: LaborBenchmark = (state ? STATE_BENCHMARKS[state] : undefined) ?? STATE_BENCHMARKS.TX;

  return {
    resolvedCounty: county,
    resolvedMsa: msa,
    detectedState: state,
    population: { total: totalPop, workingAge16Plus: workingAge },
    laborForce: {
      total: laborForceTotal,
      employed,
      unemployed,
      participationRate: seed.participationRate,
    },
    unemploymentRate: { current: seed.unemploymentRate, vintage: 'Oct 2025' },
    ageBands: ageBandsTypical(),
    education: educationDistFor(seed.educationProfile),
    medianHouseholdIncome: seed.medianIncome,
    industries,
    wagesByOccupation,
    commute: {
      meanTravelTimeMinutes: seed.meanCommuteMin,
      modeShare: modeShareTypical(seed.educationProfile),
    },
    benchmarks: {
      state: benchmarkState,
      national: NATIONAL_BENCHMARK,
    },
    vintages: {
      acs: '2019–2023 (5yr)',
      qcew: '2025-Q3',
      oews: 'May 2024',
      laus: '2025-10',
    },
    lat,
    lng,
    timestamp: new Date().toISOString(),
  };
}

// ── Real data sources ───────────────────────────────────────────────────────

interface CensusGeoResolved {
  county: ResolvedCounty | null;
  msa: ResolvedMsa | null;
  state: string | null;
}

/**
 * Census Geocoder: coords → county FIPS + CBSA/MSA. No API key required.
 * https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html
 */
async function resolveGeographies(lat: number, lng: number): Promise<CensusGeoResolved> {
  const url =
    `https://geocoding.geo.census.gov/geocoder/geographies/coordinates` +
    `?x=${encodeURIComponent(lng)}&y=${encodeURIComponent(lat)}` +
    `&benchmark=Public_AR_Current&vintage=Current_Current` +
    `&layers=Counties,Metropolitan+Statistical+Areas,Micropolitan+Statistical+Areas` +
    `&format=json`;

  try {
    const json = await cachedFetch<{
      result?: {
        geographies?: {
          Counties?: Array<{ STATE: string; COUNTY: string; NAME: string; STUSAB: string }>;
          'Metropolitan Statistical Areas'?: Array<{ CBSA: string; NAME: string }>;
          'Micropolitan Statistical Areas'?: Array<{ CBSA: string; NAME: string }>;
        };
      };
    }>(
      `labor:geo:${lat.toFixed(4)},${lng.toFixed(4)}`,
      async () => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Census Geocoder HTTP ${res.status}`);
        return res.json();
      },
      TTL_LOCATION,
    );

    const geos = json.result?.geographies ?? {};
    const countyRow = geos.Counties?.[0];
    const msaRow = geos['Metropolitan Statistical Areas']?.[0]
      ?? geos['Micropolitan Statistical Areas']?.[0]
      ?? null;

    const county: ResolvedCounty | null = countyRow
      ? { fips: `${countyRow.STATE}${countyRow.COUNTY}`, name: countyRow.NAME, state: countyRow.STUSAB }
      : null;
    const msa: ResolvedMsa | null = msaRow
      ? { code: msaRow.CBSA, name: msaRow.NAME }
      : null;

    return { county, msa, state: county?.state ?? null };
  } catch {
    return { county: null, msa: null, state: null };
  }
}

/**
 * Census ACS 5yr Data Profile (DP02/DP03/DP05) for a county.
 * Returns the partial slice of LaborAnalysisResult that ACS owns.
 */
interface AcsCountyStats {
  population: PopulationStats;
  laborForce: LaborForceStats;
  unemploymentAcs: number;
  medianHouseholdIncome: number;
  education: EducationDistribution;
  ageBands: AgeBands;
  meanCommuteMinutes: number;
  modeShare: CommuteStats['modeShare'];
}

const ACS_VINTAGE_YEAR = 2023;

function num(v: string | undefined | null): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

async function fetchAcsCounty(fips: string): Promise<AcsCountyStats | null> {
  const stateFips = fips.slice(0, 2);
  const countyFips = fips.slice(2);

  const vars = [
    'DP05_0001E',
    'DP03_0001E', 'DP03_0002E', 'DP03_0004E', 'DP03_0005E', 'DP03_0009PE', 'DP03_0062E',
    'DP02_0059E', 'DP02_0060E', 'DP02_0061E', 'DP02_0062E', 'DP02_0063E', 'DP02_0064E', 'DP02_0065E',
    'DP03_0025E', 'DP03_0019PE', 'DP03_0020PE', 'DP03_0021PE', 'DP03_0024PE',
    'DP05_0009E', 'DP05_0010E', 'DP05_0011E', 'DP05_0012E', 'DP05_0013E', 'DP05_0014E', 'DP05_0015E', 'DP05_0024E',
  ].join(',');

  const apiKey = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_CENSUS_API_KEY;
  const keyParam = apiKey ? `&key=${encodeURIComponent(apiKey)}` : '';

  const url =
    `https://api.census.gov/data/${ACS_VINTAGE_YEAR}/acs/acs5/profile` +
    `?get=${vars}` +
    `&for=county:${countyFips}&in=state:${stateFips}${keyParam}`;

  try {
    const data = await cachedFetch<string[][]>(
      `labor:acs:${fips}`,
      async () => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`ACS HTTP ${res.status}`);
        return res.json() as Promise<string[][]>;
      },
      TTL_LOCATION,
    );

    if (!Array.isArray(data) || data.length < 2) return null;
    const headers = data[0];
    const row = data[1];
    const get = (varName: string): string | undefined => {
      const i = headers.indexOf(varName);
      return i >= 0 ? row[i] : undefined;
    };

    const totalPop = num(get('DP05_0001E'));
    const popOver16 = num(get('DP03_0001E'));
    const lfTotal = num(get('DP03_0002E'));
    const employed = num(get('DP03_0004E'));
    const unemployed = num(get('DP03_0005E'));
    const unemploymentPct = num(get('DP03_0009PE'));
    const medianIncome = num(get('DP03_0062E'));

    const eduLessThan9 = num(get('DP02_0059E'));
    const eduSomeHs = num(get('DP02_0060E'));
    const eduHs = num(get('DP02_0061E'));
    const eduSomeCollege = num(get('DP02_0062E'));
    const eduAssoc = num(get('DP02_0063E'));
    const eduBach = num(get('DP02_0064E'));
    const eduGrad = num(get('DP02_0065E'));
    const eduTotal = eduLessThan9 + eduSomeHs + eduHs + eduSomeCollege + eduAssoc + eduBach + eduGrad;
    const eduDiv = eduTotal > 0 ? eduTotal : 1;

    const meanCommute = num(get('DP03_0025E'));
    const modeCar = num(get('DP03_0019PE')) / 100;
    const modeCarpool = num(get('DP03_0020PE')) / 100;
    const modeTransit = num(get('DP03_0021PE')) / 100;
    const modeWfh = num(get('DP03_0024PE')) / 100;
    const modeOther = Math.max(0, 1 - modeCar - modeCarpool - modeTransit - modeWfh);

    const age15to19 = num(get('DP05_0009E'));
    const age20to24 = num(get('DP05_0010E'));
    const age25to34 = num(get('DP05_0011E'));
    const age35to44 = num(get('DP05_0012E'));
    const age45to54 = num(get('DP05_0013E'));
    const age55to59 = num(get('DP05_0014E'));
    const age60to64 = num(get('DP05_0015E'));
    const age65plus = num(get('DP05_0024E'));
    const age16to24 = age15to19 * 0.4 + age20to24;
    const age25to44 = age25to34 + age35to44;
    const age45to64 = age45to54 + age55to59 + age60to64;
    const ageTotal = age16to24 + age25to44 + age45to64 + age65plus;
    const ageDiv = ageTotal > 0 ? ageTotal : 1;

    return {
      population: { total: totalPop, workingAge16Plus: popOver16 },
      laborForce: {
        total: lfTotal,
        employed,
        unemployed,
        participationRate: popOver16 > 0 ? lfTotal / popOver16 : 0,
      },
      unemploymentAcs: unemploymentPct,
      medianHouseholdIncome: medianIncome,
      education: {
        noHs: (eduLessThan9 + eduSomeHs) / eduDiv,
        hs: eduHs / eduDiv,
        someCollege: eduSomeCollege / eduDiv,
        associate: eduAssoc / eduDiv,
        bachelor: eduBach / eduDiv,
        graduate: eduGrad / eduDiv,
      },
      ageBands: {
        '16-24': age16to24 / ageDiv,
        '25-44': age25to44 / ageDiv,
        '45-64': age45to64 / ageDiv,
        '65+': age65plus / ageDiv,
      },
      meanCommuteMinutes: meanCommute,
      modeShare: {
        car: modeCar,
        carpool: modeCarpool,
        transit: modeTransit,
        wfh: modeWfh,
        other: modeOther,
      },
    };
  } catch {
    return null;
  }
}

// ── Public entry point ──────────────────────────────────────────────────────

export interface AnalyzeLaborOptions {
  coordinates?: { lat: number; lng: number };
  address?: string;
}

/**
 * Run the labor pool analysis for a site.
 * Live: Census Geocoder + Census ACS 5yr.
 * Mock fallback: industries (QCEW), occupations + wages (OEWS), unemployment (LAUS)
 * — these activate when the BLS API key wiring is added in a follow-up.
 */
export async function analyzeLabor(opts: AnalyzeLaborOptions): Promise<LaborAnalysisResult> {
  let lat = opts.coordinates?.lat;
  let lng = opts.coordinates?.lng;

  if ((lat == null || lng == null) && opts.address) {
    const geo = await geocodeAddress(opts.address);
    if (geo) {
      lat = geo.lat;
      lng = geo.lng;
    }
  }

  if (lat == null || lng == null) {
    throw new Error('Labor analysis requires coordinates or a geocodable address.');
  }

  // 1. Resolve county FIPS + MSA via Census Geocoder
  const geo = await resolveGeographies(lat, lng);
  const detectedState = geo.state ?? (await detectStateFromCoords(lat, lng));

  // 2. Start with the seed mock so any field we don't fetch live still has data
  const base = buildMockResult({ lat, lng, state: detectedState });

  // 3. Override the resolved geos with the real ones from Census Geocoder
  if (geo.county) base.resolvedCounty = geo.county;
  if (geo.msa)    base.resolvedMsa = geo.msa;
  base.detectedState = detectedState;

  // 4. Fetch live ACS data for the county
  if (geo.county) {
    const acs = await fetchAcsCounty(geo.county.fips);
    if (acs) {
      base.population = acs.population;
      base.laborForce = acs.laborForce;
      base.unemploymentRate = {
        current: acs.unemploymentAcs,
        vintage: `ACS ${ACS_VINTAGE_YEAR - 4}–${ACS_VINTAGE_YEAR} 5yr`,
      };
      base.medianHouseholdIncome = acs.medianHouseholdIncome;
      base.education = acs.education;
      base.ageBands = acs.ageBands;
      base.commute = {
        meanTravelTimeMinutes: acs.meanCommuteMinutes,
        modeShare: acs.modeShare,
      };
      // Re-derive industry / occupation employment counts off the real employed total
      const realEmployed = acs.laborForce.employed;
      if (realEmployed > 0) {
        const totalMockEmployed = base.industries.reduce((s, r) => s + r.employed, 0) || 1;
        base.industries = base.industries.map((r) => ({
          ...r,
          employed: Math.round((r.employed / totalMockEmployed) * realEmployed),
        }));
        const totalMockOccEmployed = base.wagesByOccupation.reduce((s, r) => s + (r.employed ?? 0), 0) || 1;
        base.wagesByOccupation = base.wagesByOccupation.map((r) => ({
          ...r,
          employed: r.employed != null
            ? Math.round((r.employed / totalMockOccEmployed) * realEmployed)
            : r.employed,
        }));
      }
    } else {
      base.acsError = 'Census ACS lookup failed; showing seed estimates.';
    }
  } else {
    base.acsError = 'Could not resolve county for these coordinates.';
  }

  // 5. TODO: Wire BLS QCEW, BLS LAUS, BLS OEWS once VITE_BLS_API_KEY is configured.
  base.qcewError = 'BLS QCEW not yet wired — industry rows are seed estimates.';
  base.oewsError = 'BLS OEWS not yet wired — occupational wages are seed estimates.';

  return base;
}
