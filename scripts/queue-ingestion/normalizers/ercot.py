"""
ERCOT — gridstatus only reads the "Project Details - Large Gen" sheet (active +
completed). The same GIS Report Excel has an "Inactive Projects" sheet with
withdrawn projects we need for the 5-year withdrawal-rate metric.

We fetch the raw Excel directly and merge in the withdrawn rows.
"""
import io
import json
import urllib.request
import pandas as pd
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from common import (
    norm_status, norm_fuel, parse_poi, norm_state, norm_county,
    to_iso_date, safe_str, safe_float,
)
from ._base import normalize_row


GIS_LIST_URL = "https://www.ercot.com/misapp/servlets/IceDocListJsonWS?reportTypeId=15933"
GIS_DOWNLOAD_URL = "https://www.ercot.com/misdownload/servlets/mirDownload?doclookupId={}"


def _fetch_latest_gis_xlsx_bytes():
    with urllib.request.urlopen(GIS_LIST_URL, timeout=60) as r:
        listing = json.loads(r.read().decode())
    docs = listing.get("ListDocsByRptTypeRes", {}).get("DocumentList", [])
    xlsx_doc = next(
        (d for d in docs
         if d.get("Document", {}).get("Extension") == "xlsx"
         and "gis_report" in str(d.get("Document", {}).get("FriendlyName", "")).lower()),
        None,
    )
    if not xlsx_doc:
        return None
    doc_id = xlsx_doc["Document"]["DocID"]
    with urllib.request.urlopen(GIS_DOWNLOAD_URL.format(doc_id), timeout=120) as r:
        return r.read()


def _load_inr_registry():
    """Load the historical INR -> POI registry built by build_ercot_archive.py."""
    p = Path(__file__).parent.parent / "data" / "ercot_inr_registry.json"
    if p.exists():
        return json.loads(p.read_text())
    return {}


def _parse_inactive(xlsx_bytes, inr_registry):
    """Read 'Inactive Projects' sheet and return list of normalized withdrawn rows,
    enriching POI from the historical INR registry where available."""
    buf = io.BytesIO(xlsx_bytes)
    df = pd.read_excel(buf, sheet_name="Inactive Projects", skiprows=30, header=None)
    df = df.iloc[1:].copy()
    df.columns = [
        "Queue ID", "Project Type", "Project Name", "Fuel",
        "County", "Withdrawn Date", "Capacity (MW)",
    ] + [f"_extra_{i}" for i in range(max(0, df.shape[1] - 7))]
    df = df.dropna(subset=["Queue ID"])

    out = []
    poi_recovered = 0
    for _, row in df.iterrows():
        inr = safe_str(row.get("Queue ID"))
        county = norm_county(safe_str(row.get("County")))
        capacity = safe_float(row.get("Capacity (MW)"))
        fuel_raw = safe_str(row.get("Fuel"))

        # Recover POI from historical archive
        archive = inr_registry.get(inr) if inr else None
        poi_str = archive.get("poi") if archive else None
        poi = parse_poi(poi_str) if poi_str else None
        if poi:
            poi_recovered += 1

        out.append({
            "iso": "ERCOT",
            "queue_id": inr,
            "project_name": safe_str(row.get("Project Name")),
            "status": "WITHDRAWN",
            "status_raw": "Inactive",
            "capacity_mw": capacity,
            "fuel": norm_fuel(fuel_raw),
            "fuel_raw": fuel_raw,
            "state": "TX",
            "county": county,
            "poi": poi,
            "transmission_owner": None,
            "queue_date": None,
            "proposed_cod": None,
            "withdrawn_date": to_iso_date(row.get("Withdrawn Date")),
            "in_service_date": None,
        })
    print(f"  ERCOT inactive: {poi_recovered}/{len(out)} POIs recovered from archive")
    return out


def normalize(df):
    """gridstatus DataFrame (active + completed) PLUS withdrawn rows from raw Excel."""
    rows = [n for n in (normalize_row(row, iso="ERCOT") for _, row in df.iterrows()) if n]

    try:
        xlsx = _fetch_latest_gis_xlsx_bytes()
        if xlsx:
            registry = _load_inr_registry()
            withdrawn = _parse_inactive(xlsx, registry)
            print(f"  ERCOT: +{len(withdrawn)} withdrawn rows from raw GIS Excel")
            rows.extend(withdrawn)
    except Exception as e:
        print(f"  ERCOT: WARNING — could not fetch withdrawn rows: {type(e).__name__}: {e}")

    return rows
