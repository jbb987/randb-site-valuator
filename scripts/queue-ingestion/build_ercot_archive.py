"""
Build a historical INR -> POI registry from ERCOT's monthly GIS Report archive.

Strategy:
  1. Download the last N months of GIS Reports in parallel.
  2. For each, parse "Project Details - Large Gen" sheet (active queue snapshot).
  3. Build INR -> latest POI map (most recent snapshot wins).
  4. Save as JSON for the ERCOT normalizer to use.

This lets us recover POI substation for ERCOT projects that have since been
withdrawn — the current "Inactive Projects" sheet strips POI, but earlier
snapshots had it.
"""
import io
import json
import urllib.request
import concurrent.futures as cf
import pandas as pd
from pathlib import Path

OUT = Path(__file__).parent / "data"
OUT.mkdir(exist_ok=True)

LIST_URL = "https://www.ercot.com/misapp/servlets/IceDocListJsonWS?reportTypeId=15933"
DL_URL = "https://www.ercot.com/misdownload/servlets/mirDownload?doclookupId={}"

MONTHS_TO_INGEST = 36  # ~3 years; enough for 5-year-rolling rate


def list_archives():
    with urllib.request.urlopen(LIST_URL, timeout=60) as r:
        listing = json.loads(r.read().decode())
    docs = listing.get("ListDocsByRptTypeRes", {}).get("DocumentList", [])
    gis = [
        d["Document"] for d in docs
        if d["Document"].get("Extension") == "xlsx"
        and "gis_report" in d["Document"].get("FriendlyName", "").lower()
        and "co-located" not in d["Document"].get("FriendlyName", "").lower()
    ]
    gis.sort(key=lambda d: d.get("PublishDate", ""), reverse=True)
    return gis[:MONTHS_TO_INGEST]


def parse_active_queue(xlsx_bytes, snapshot_name):
    """Parse 'Project Details - Large Gen' sheet → list of {INR, POI, county, mw, fuel, status}."""
    buf = io.BytesIO(xlsx_bytes)
    try:
        df = pd.read_excel(buf, sheet_name="Project Details - Large Gen", skiprows=30)
        df = df.iloc[4:].copy()  # match gridstatus's row offset
    except Exception as e:
        print(f"  [{snapshot_name}] FAILED to parse: {e}")
        return []

    out = []
    for _, row in df.iterrows():
        inr = row.get("INR")
        if not inr or pd.isna(inr):
            continue
        poi = row.get("POI Location")
        if isinstance(poi, str):
            poi = poi.strip()
        elif pd.isna(poi):
            poi = None
        out.append({
            "inr": str(inr).strip(),
            "poi": poi,
            "project_name": str(row.get("Project Name") or "").strip() or None,
            "county": str(row.get("County") or "").strip() or None,
            "fuel": str(row.get("Fuel") or "").strip() or None,
            "capacity_mw": float(row.get("Capacity (MW)")) if pd.notna(row.get("Capacity (MW)")) else None,
            "snapshot": snapshot_name,
        })
    return out


def fetch_and_parse(doc):
    name = doc["FriendlyName"]
    doc_id = doc["DocID"]
    try:
        with urllib.request.urlopen(DL_URL.format(doc_id), timeout=120) as r:
            xlsx = r.read()
        rows = parse_active_queue(xlsx, name)
        return name, rows, None
    except Exception as e:
        return name, [], f"{type(e).__name__}: {e}"


def main():
    print(f"Listing ERCOT GIS Report archive...")
    archives = list_archives()
    print(f"Will pull {len(archives)} monthly snapshots")
    print()

    # POI registry: INR -> most recent {poi, project_name, county, fuel, capacity_mw, snapshot}
    registry = {}
    snapshots_done = 0

    with cf.ThreadPoolExecutor(max_workers=8) as ex:
        futures = [ex.submit(fetch_and_parse, doc) for doc in archives]
        for fut in cf.as_completed(futures):
            name, rows, err = fut.result()
            snapshots_done += 1
            if err:
                print(f"  [{snapshots_done}/{len(archives)}] {name:35s} FAIL: {err}")
                continue
            print(f"  [{snapshots_done}/{len(archives)}] {name:35s} {len(rows):>5} active projects")
            for r in rows:
                inr = r["inr"]
                # Most recent snapshot wins (higher PublishDate)
                # Since archives are sorted newest-first and we may process in any order,
                # only update if this snapshot is newer
                if inr not in registry or registry[inr]["snapshot"] < r["snapshot"]:
                    registry[inr] = r

    print(f"\n{len(registry):,} unique INRs in registry")
    poi_known = sum(1 for v in registry.values() if v.get("poi"))
    print(f"  with POI:    {poi_known} ({poi_known*100//len(registry)}%)")

    out_file = OUT / "ercot_inr_registry.json"
    out_file.write_text(json.dumps(registry, default=str))
    print(f"Saved -> {out_file}")


if __name__ == "__main__":
    main()
