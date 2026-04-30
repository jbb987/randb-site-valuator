"""
Shared normalization helpers for all 7 ISO queue ingestions.
Pure functions only — no I/O, no globals.
"""
import re
import pandas as pd

# ── Status normalization ──────────────────────────────────────────────
def norm_status(s):
    """Map any ISO's status string to one of: WITHDRAWN, IN_SERVICE, ACTIVE,
    UNDER_CONSTRUCTION, SUSPENDED, UNKNOWN."""
    if not isinstance(s, str):
        return "UNKNOWN"
    s = s.strip().lower()
    if any(k in s for k in ["withdraw", "retract", "cancel", "annul", "deactiv"]):
        return "WITHDRAWN"
    if any(k in s for k in ["in service", "completed", "done", "operational"]):
        return "IN_SERVICE"
    if any(k in s for k in ["under construction", "engineering", "partially in service"]):
        return "UNDER_CONSTRUCTION"
    if "suspend" in s:
        return "SUSPENDED"
    if any(k in s for k in ["active", "confirmed", "pending"]):
        return "ACTIVE"
    return "UNKNOWN"


# ── Fuel normalization ────────────────────────────────────────────────
_FUEL_RX = [
    (re.compile(r"hybrid|solar.*storage|storage.*solar|wind.*storage|solar/battery|solar/wind", re.I), "HYBRID"),
    (re.compile(r"\bsolar|photovoltaic|\bpv\b", re.I), "SOLAR"),
    (re.compile(r"\bwind", re.I), "WIND"),
    (re.compile(r"battery|storage|bess", re.I), "STORAGE"),
    (re.compile(r"natural gas|\bgas\b|combined cycle|combustion turbine|gas turbine", re.I), "GAS"),
    (re.compile(r"nuclear", re.I), "NUCLEAR"),
    (re.compile(r"hydro", re.I), "HYDRO"),
    (re.compile(r"\bcoal", re.I), "COAL"),
    (re.compile(r"biomass|wood|landfill|methane|biogas", re.I), "BIOMASS"),
    (re.compile(r"oil|diesel|petroleum", re.I), "OIL"),
    (re.compile(r"geothermal|steam", re.I), "GEOTHERMAL"),
]


def norm_fuel(s):
    if not isinstance(s, str):
        return "OTHER"
    for rx, code in _FUEL_RX:
        if rx.search(s):
            return code
    return "OTHER"


# ── Voltage extraction ────────────────────────────────────────────────
_VOLTAGE_RX = re.compile(r"(\d{2,4}(?:\.\d+)?)\s*k?V", re.I)
_COMMON_VOLTAGES = [765, 500, 345, 230, 161, 138, 115, 69, 46, 34.5, 25, 12.47, 13.8, 4.16]


def extract_voltage(s):
    """Pull a kV number from a string and snap to a common voltage class."""
    if not isinstance(s, str):
        return None
    m = _VOLTAGE_RX.search(s)
    if not m:
        return None
    v = float(m.group(1))
    for common in _COMMON_VOLTAGES:
        if abs(v - common) <= 2:
            return common
    return v


def parse_voltage_field(v):
    """Coerce HIFLD/ISO voltage string to float kV. Returns None for 'NOT AVAILABLE' etc."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v) if v else None
    s = str(v).strip()
    if not s or s.upper() in ("NOT AVAILABLE", "N/A", "UNKNOWN", "NULL", "NA"):
        return None
    m = re.search(r"(\d+(?:\.\d+)?)", s)
    return float(m.group(1)) if m else None


# ── POI parsing ───────────────────────────────────────────────────────
_LINE_TAP_RX = re.compile(r"(?:line\s*tap|line\s*-?\s*tap|\stap\b|\bswitching\s*station\b)", re.I)


def _clean_endpoint(s):
    """Strip voltage/qualifier noise from a substation name."""
    if not s:
        return ""
    s = re.sub(_VOLTAGE_RX, "", s)
    s = re.sub(r"\b(substation|switching\s*station|switchyard|\bsub\b|line\s*tap|tap)\b", "", s, flags=re.I)
    s = re.sub(r"\([^)]*\)", "", s)
    s = re.sub(r"#\s*\d+", "", s)
    s = re.sub(r"\s+", " ", s).strip(" -–")
    return s


def parse_poi(raw):
    """Return {raw, kind, endpoints[], voltage_kv} or None.

    Kinds:
      SUBSTATION  - single point of connection
      LINE_TAP    - tapped between two substations
      UNKNOWN     - parse failed
    """
    if not isinstance(raw, str) or not raw.strip():
        return None
    raw = raw.strip()
    voltage = extract_voltage(raw)
    is_tap = bool(_LINE_TAP_RX.search(raw))

    core = re.sub(_VOLTAGE_RX, "", raw)
    core = _LINE_TAP_RX.sub("", core).strip(" -–")

    parts = re.split(r"\s+(?:-|–|to|/)\s+", core)
    endpoints = [_clean_endpoint(p) for p in parts]
    endpoints = [e for e in endpoints if e]

    if is_tap and len(endpoints) >= 2:
        kind = "LINE_TAP"
        endpoints = endpoints[:2]
    elif len(endpoints) == 1:
        kind = "SUBSTATION"
    elif len(endpoints) >= 2:
        kind = "LINE_TAP"
        endpoints = endpoints[:2]
    else:
        kind = "UNKNOWN"
        endpoints = []

    return {"raw": raw, "kind": kind, "endpoints": endpoints, "voltage_kv": voltage}


# ── County + state normalization ──────────────────────────────────────
_STATE_NAME_TO_CODE = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR", "california": "CA",
    "colorado": "CO", "connecticut": "CT", "delaware": "DE", "florida": "FL", "georgia": "GA",
    "hawaii": "HI", "idaho": "ID", "illinois": "IL", "indiana": "IN", "iowa": "IA",
    "kansas": "KS", "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
    "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS",
    "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV", "new hampshire": "NH",
    "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC",
    "north dakota": "ND", "ohio": "OH", "oklahoma": "OK", "oregon": "OR", "pennsylvania": "PA",
    "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", "tennessee": "TN",
    "texas": "TX", "utah": "UT", "vermont": "VT", "virginia": "VA", "washington": "WA",
    "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY", "district of columbia": "DC",
}

_VALID_STATES = set(_STATE_NAME_TO_CODE.values())


def norm_state(s):
    """Coerce 'Texas', 'TEXAS', 'tx' all to 'TX'. None for unknown."""
    if not isinstance(s, str):
        return None
    s = s.strip()
    if len(s) == 2 and s.upper() in _VALID_STATES:
        return s.upper()
    return _STATE_NAME_TO_CODE.get(s.lower())


def norm_county(s):
    if not isinstance(s, str):
        return None
    s = s.strip()
    s = re.sub(r"\s+(County|Parish|Borough|Census Area)\s*$", "", s, flags=re.I)
    return s.strip() or None


# ── Date helpers ──────────────────────────────────────────────────────
def to_iso_date(s):
    if pd.isna(s) or s is None:
        return None
    try:
        d = pd.to_datetime(s, errors="coerce", utc=True)
        if pd.isna(d):
            return None
        return d.strftime("%Y-%m-%d")
    except Exception:
        return None


# ── Misc safety ───────────────────────────────────────────────────────
def safe_str(v):
    """Pandas-NaN-safe string strip."""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    s = str(v).strip()
    return s or None


def safe_float(v):
    n = pd.to_numeric(v, errors="coerce")
    return float(n) if pd.notna(n) else None
