/**
 * Water Analysis types — Phase 1
 * FEMA Flood Zone, USGS NLDI Stream/Basin, NWI Wetlands
 */

export type FloodRiskLevel = 'minimal' | 'moderate' | 'high' | 'very-high' | 'unknown';

export interface FloodZoneInfo {
  /** FEMA flood zone designation (e.g. X, AE, A, VE, AO, D) */
  zone: string;
  /** Zone subtype (e.g. FLOODWAY, 0.2 PCT ANNUAL CHANCE FLOOD HAZARD) */
  zoneSubtype: string;
  /** Base Flood Elevation in feet (null if not applicable) */
  staticBfe: number | null;
  riskLevel: FloodRiskLevel;
  /** Human-readable description of the flood zone */
  description: string;
  /** FEMA FIRM panel link if available */
  firmUrl?: string;
}

export interface MonitoringStation {
  /** USGS site identifier */
  identifier: string;
  name: string;
  type: string;
  /** Approximate distance from query point in miles */
  distanceMi?: number;
  /** USGS Water Resources URL */
  url: string;
}

export interface StreamInfo {
  /** NHD+ Reach Common Identifier */
  comid: string | null;
  streamName: string | null;
  reachCode: string | null;
  /** Strahler stream order */
  streamOrder: number | null;
  /** Drainage basin area in km² */
  basinAreaKm2: number | null;
  /** Upstream navigation status */
  navigationStatus: 'found' | 'not-found';
  monitoringStations: MonitoringStation[];
}

export interface WetlandFeature {
  /** NWI attribute code (e.g. PEM1C, PFO1A) */
  attribute: string;
  /** Plain-language wetland type */
  wetlandType: string;
  /** Acreage of the feature */
  acres: number | null;
  /** Distance from query point in feet */
  distanceFt: number | null;
}

export interface WetlandsInfo {
  hasWetlands: boolean;
  wetlands: WetlandFeature[];
  /** Distance to nearest wetland in feet (null if none found) */
  nearestWetlandFt: number | null;
}

export interface WaterAnalysisResult {
  lat: number;
  lng: number;
  analyzedAt: number;

  floodZone: FloodZoneInfo | null;
  floodZoneError: string | null;

  stream: StreamInfo | null;
  streamError: string | null;

  wetlands: WetlandsInfo | null;
  wetlandsError: string | null;
}
