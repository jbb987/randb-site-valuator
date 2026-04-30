"""Pull HIFLD substations for all 50 U.S. states (+DC). Saves nationwide JSON."""
import json
import time
import urllib.request
import urllib.parse
import concurrent.futures as cf
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent))
from common import parse_voltage_field

URL = "https://services1.arcgis.com/PMShNXB1carltgVf/arcgis/rest/services/Electric_Substations/FeatureServer/0/query"

STATES = [
    "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME",
    "MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI",
    "SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
]


def fetch_state(state):
    out = []
    offset = 0
    while True:
        params = {
            "where": f"STATE='{state}'",
            "outFields": "ID,NAME,CITY,STATE,COUNTY,COUNTYFIPS,LATITUDE,LONGITUDE,MAX_VOLT,MIN_VOLT,LINES,STATUS,TYPE",
            "f": "json", "outSR": 4326,
            "resultRecordCount": 1000, "resultOffset": offset, "orderByFields": "ID",
        }
        url = f"{URL}?{urllib.parse.urlencode(params)}"
        with urllib.request.urlopen(url, timeout=60) as r:
            data = json.loads(r.read().decode())
        feats = data.get("features", [])
        if not feats:
            break
        for f in feats:
            a = f.get("attributes", {})
            out.append({
                "hifld_id": a.get("ID"),
                "name": (a.get("NAME") or "").strip(),
                "city": (a.get("CITY") or "").strip() or None,
                "state": a.get("STATE"),
                "county": (a.get("COUNTY") or "").strip() or None,
                "county_fips": a.get("COUNTYFIPS"),
                "lat": a.get("LATITUDE"),
                "lng": a.get("LONGITUDE"),
                "max_volt_kv": parse_voltage_field(a.get("MAX_VOLT")),
                "min_volt_kv": parse_voltage_field(a.get("MIN_VOLT")),
                "lines": a.get("LINES"),
                "status": a.get("STATUS"),
                "type": a.get("TYPE"),
            })
        if len(feats) < 1000:
            break
        offset += 1000
    return state, out


def main():
    OUT = Path(__file__).parent / "data"
    OUT.mkdir(exist_ok=True)
    all_subs = []

    t0 = time.time()
    with cf.ThreadPoolExecutor(max_workers=10) as ex:
        for state, rows in ex.map(fetch_state, STATES):
            print(f"  {state}: {len(rows):>5}")
            all_subs.extend(rows)

    print(f"\nTotal: {len(all_subs):,} substations across {len(STATES)} states ({time.time()-t0:.1f}s)")
    out_file = OUT / "HIFLD_us.json"
    out_file.write_text(json.dumps(all_subs, default=str))
    print(f"Saved -> {out_file}")

    named = sum(1 for s in all_subs
                if s["name"] and not s["name"].upper().startswith(("UNKNOWN", "TAP")))
    voltage_known = sum(1 for s in all_subs if s["max_volt_kv"])
    print(f"Named:                {named:>7} ({named/len(all_subs):.0%})")
    print(f"Voltage known:        {voltage_known:>7} ({voltage_known/len(all_subs):.0%})")


if __name__ == "__main__":
    main()
