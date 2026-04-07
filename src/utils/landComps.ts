import type { LandComp } from '../types';

// ── Claude Prompt ────────────────────────────────────────────────────────

export const CLAUDE_LANDID_PROMPT = `I'm uploading a LandID comparable sales PDF. Please extract all comparable properties (skip the subject property "A") and output ONLY a CSV table with these exact headers — no markdown, no explanation, no extra text:

Address,County,Sale Date,Total Price,Acres,Price Per Acre,Land Use,Parcel ID

Rules:
- Wrap addresses in quotes if they contain commas
- Sale Date as YYYY-MM-DD
- Total Price as plain number (no $ or commas)
- Acres as decimal number
- Price Per Acre as plain number (no $ or commas)
- Land Use as-is from the PDF (e.g. Agricultural, Residential, Vacant)
- If a field is missing or N/A, leave it empty
- One row per comparable, no blank lines
- Skip any property with no sale price`;

// ── CSV Parser ───────────────────────────────────────────────────────────

function parseNumber(raw: string): number {
  const cleaned = raw.replace(/[$,]/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

/** Parse RFC-4180-ish CSV line, handling quoted fields with commas. */
function splitCsvRow(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

export function parseLandCompsCsv(csv: string): LandComp[] {
  const lines = csv.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  // Skip header row
  const comps: LandComp[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = splitCsvRow(lines[i]);
    if (fields.length < 6) continue;

    const totalPrice = parseNumber(fields[3]);
    const acres = parseNumber(fields[4]);
    const pricePerAcre = parseNumber(fields[5]) || (acres > 0 ? totalPrice / acres : 0);

    if (totalPrice === 0 && pricePerAcre === 0) continue; // skip entries with no price data

    comps.push({
      id: crypto.randomUUID(),
      address: fields[0] || '',
      county: fields[1] || '',
      saleDate: fields[2] || '',
      totalPrice,
      acres,
      pricePerAcre,
      landUse: fields[6] || '',
      parcelId: fields[7] || '',
    });
  }

  return comps;
}

// ── Stats ────────────────────────────────────────────────────────────────

export interface CompStats {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p25: number;
  p75: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function computeCompStats(comps: LandComp[]): CompStats {
  const values = comps.map((c) => c.pricePerAcre).filter((v) => v > 0).sort((a, b) => a - b);
  if (values.length === 0) {
    return { count: 0, min: 0, max: 0, mean: 0, median: 0, p25: 0, p75: 0 };
  }
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    count: values.length,
    min: values[0],
    max: values[values.length - 1],
    mean: sum / values.length,
    median: percentile(values, 50),
    p25: percentile(values, 25),
    p75: percentile(values, 75),
  };
}
