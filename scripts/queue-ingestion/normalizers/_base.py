"""Shared row-level normalization. Per-ISO modules customize via overrides."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from common import (
    norm_status, norm_fuel, parse_poi, norm_state, norm_county,
    to_iso_date, safe_str, safe_float,
)

ISO_FOOTPRINTS = {
    "PJM":   {"DE","DC","IL","IN","KY","MD","MI","NJ","NC","OH","PA","TN","VA","WV"},
    "MISO":  {"AR","IL","IN","IA","KY","LA","MI","MN","MS","MO","MT","ND","SD","TX","WI"},
    "ERCOT": {"TX"},
    "SPP":   {"AR","IA","KS","LA","MN","MO","MT","NE","NM","ND","OK","SD","TX","WY"},
    "CAISO": {"CA","NV"},
    "NYISO": {"NY"},
    "ISONE": {"CT","ME","MA","NH","RI","VT"},
}


def normalize_row(row, iso, poi_field="Interconnection Location", project_name_field="Project Name"):
    """Default row normalizer. Per-ISO modules override this where needed."""
    state = norm_state(row.get("State"))
    if not state:
        return None
    if iso in ISO_FOOTPRINTS and state not in ISO_FOOTPRINTS[iso]:
        # Some ISOs have stray rows in odd states; drop them
        return None

    poi = parse_poi(safe_str(row.get(poi_field)))
    capacity = safe_float(row.get("Capacity (MW)"))

    return {
        "iso": iso,
        "queue_id": safe_str(row.get("Queue ID")),
        "project_name": safe_str(row.get(project_name_field)),
        "status": norm_status(safe_str(row.get("Status"))),
        "status_raw": safe_str(row.get("Status")),
        "capacity_mw": capacity,
        "fuel": norm_fuel(safe_str(row.get("Generation Type")) or safe_str(row.get("facilityType"))),
        "fuel_raw": safe_str(row.get("Generation Type")),
        "state": state,
        "county": norm_county(safe_str(row.get("County"))),
        "poi": poi,
        "transmission_owner": safe_str(row.get("Transmission Owner")),
        "queue_date": to_iso_date(row.get("Queue Date")),
        "proposed_cod": to_iso_date(row.get("Proposed Completion Date")),
        "withdrawn_date": to_iso_date(row.get("Withdrawn Date")),
        "in_service_date": to_iso_date(row.get("inService") or row.get("Actual Completion Date")),
    }
