"""
Per-substation aggregation.

For each HIFLD substation that has matched queue projects, output two
buckets of stats:

  confirmed  — projects we matched specifically to this substation
               (high-confidence: name match, voltage match, or line tap
               endpoint).
  area       — projects we could only narrow to a county+voltage cluster.
               Same projects appear on every cluster member; the card
               makes that explicit with cluster_size + county/voltage.

Match-method classification:
  CONFIRMED:  EXACT, HIGH, MEDIUM, COUNTY_ONLY_NAME, COUNTY_ONLY_UNIQUE,
              STATE_ONLY, TAP_BOTH, TAP_ONE
  AREA:       MULTI_AMBIGUOUS

No apportionment: full project MW shown in each bucket. Line taps are
counted once per endpoint (they really do touch both substations).
Cluster projects show on every cluster member with the same data.

Cluster size cap (MAX_USEFUL_CLUSTER_SIZE): if a project's cluster has
more than this many candidate substations, the area data is too diluted
to be useful — drop it. The substation may still have confirmed-bucket
data from other projects.

Top-N projects: 5 (was 3).
"""
import json
import statistics
from datetime import date, timedelta
from pathlib import Path
from collections import defaultdict


TODAY = date.today()
WINDOW_5Y_AGO = TODAY - timedelta(days=5 * 365)

CONFIRMED_METHODS = {
    "EXACT", "HIGH", "MEDIUM",
    "COUNTY_ONLY_NAME", "COUNTY_ONLY_UNIQUE",
    "STATE_ONLY",
    "TAP_BOTH", "TAP_ONE",
}
AREA_METHODS = {"MULTI_AMBIGUOUS"}

# Above this cluster size, area data is too diluted to be useful — projects
# could be at any of N substations. Drop it from individual substation cards.
MAX_USEFUL_CLUSTER_SIZE = 25


def date_or_none(s):
    if not s:
        return None
    try:
        return date.fromisoformat(str(s)[:10])
    except Exception:
        return None


def empty_bucket():
    return {
        "active_projects": [],
        "in_service_projects": [],
        "withdrawn_5y_projects": [],
    }


def render_bucket(bucket, want_metrics):
    """Turn raw project lists into a renderable summary."""
    active = bucket["active_projects"]
    in_serv = bucket["in_service_projects"]
    wd5y = bucket["withdrawn_5y_projects"]

    out = {
        "active_count": len(active),
        "active_mw": round(sum(p["mw"] for p in active), 1),
        "in_service_count": len(in_serv),
        "in_service_mw": round(sum(p["mw"] for p in in_serv), 1),
        "withdrawn_count_5y": len(wd5y),
        "withdrawn_mw_5y": round(sum(p["mw"] for p in wd5y), 1),
    }

    top_active = sorted(active, key=lambda p: -(p["mw"] or 0))[:5]
    out["top_active"] = [
        {"name": p["name"], "mw": p["mw"], "fuel": p["fuel"], "cod": p["cod"]}
        for p in top_active
    ]

    cods = [p["proposed_cod"] for p in active if p.get("proposed_cod")]
    out["earliest_active_cod"] = min(cods).isoformat() if cods else None

    if want_metrics:
        denom = len(wd5y) + len(in_serv) + len(active)
        out["withdrawal_rate_5y"] = round(len(wd5y) / denom, 3) if denom >= 3 else None

        cod_days = []
        for p in in_serv:
            qd, isd = p.get("queue_date"), p.get("in_service_date")
            if qd and isd:
                d = (isd - qd).days
                if 90 < d < 365 * 15:
                    cod_days.append(d)
        out["median_time_to_cod_days"] = round(statistics.median(cod_days)) if len(cod_days) >= 3 else None
        out["completed_sample_size"] = len(cod_days)
    return out


def main():
    OUT = Path(__file__).parent / "data"
    matched = json.loads((OUT / "all_matched.json").read_text())

    sub_meta = {}
    sub_confirmed = defaultdict(empty_bucket)
    sub_area = defaultdict(empty_bucket)
    sub_cluster_ctx = defaultdict(lambda: {"sizes": [], "counties": set(), "voltages": set()})

    for p in matched:
        if not p.get("match"):
            continue
        method = p.get("match_method")
        is_confirmed = method in CONFIRMED_METHODS
        is_area = method in AREA_METHODS
        if not (is_confirmed or is_area):
            continue

        capacity = p.get("capacity_mw") or 0
        status = p["status"]
        proj_record = {
            "queue_id": p.get("queue_id"),
            "name": p.get("project_name") or p.get("queue_id"),
            "mw": capacity,
            "fuel": p["fuel"],
            "cod": (p.get("proposed_cod") or "")[:10] or None,
            "queue_date": date_or_none(p.get("queue_date")),
            "in_service_date": date_or_none(p.get("in_service_date")),
            "withdrawn_date": date_or_none(p.get("withdrawn_date")),
            "proposed_cod": date_or_none(p.get("proposed_cod")),
            "status": status,
        }

        cluster_size = len(p["match"])

        # Skip area-level projects when their cluster is too large to be useful.
        # The project could be at any of these substations; spreading it across
        # 25+ candidates dilutes signal beyond usefulness.
        if is_area and cluster_size > MAX_USEFUL_CLUSTER_SIZE:
            continue

        for m in p["match"]:
            hifld_id = m["hifld_id"]
            sub_meta.setdefault(hifld_id, {
                "iso": p["iso"], "name": m["name"], "lat": m.get("lat"), "lng": m.get("lng"),
            })
            bucket = sub_confirmed[hifld_id] if is_confirmed else sub_area[hifld_id]
            if status in ("ACTIVE", "UNDER_CONSTRUCTION", "SUSPENDED"):
                bucket["active_projects"].append(proj_record)
            elif status == "IN_SERVICE":
                bucket["in_service_projects"].append(proj_record)
            elif status == "WITHDRAWN" and proj_record["withdrawn_date"] and proj_record["withdrawn_date"] >= WINDOW_5Y_AGO:
                bucket["withdrawn_5y_projects"].append(proj_record)

            if is_area:
                ctx = sub_cluster_ctx[hifld_id]
                ctx["sizes"].append(cluster_size)
                if p.get("county"):
                    ctx["counties"].add(p["county"])
                if p.get("poi") and p["poi"].get("voltage_kv"):
                    ctx["voltages"].add(p["poi"]["voltage_kv"])

    aggregated = []
    all_ids = set(sub_confirmed.keys()) | set(sub_area.keys())
    for hifld_id in all_ids:
        meta = sub_meta[hifld_id]
        confirmed_summary = render_bucket(sub_confirmed[hifld_id], want_metrics=True) if hifld_id in sub_confirmed else None
        area_summary = render_bucket(sub_area[hifld_id], want_metrics=False) if hifld_id in sub_area else None

        def is_empty(b):
            return b is None or (b["active_count"] == 0 and b["in_service_count"] == 0 and b["withdrawn_count_5y"] == 0)
        if is_empty(confirmed_summary) and is_empty(area_summary):
            continue
        if is_empty(confirmed_summary):
            confirmed_summary = None
        if is_empty(area_summary):
            area_summary = None

        rec = {
            "hifld_id": hifld_id,
            "iso": meta["iso"],
            "name": meta["name"],
            "lat": meta["lat"],
            "lng": meta["lng"],
            "confirmed": confirmed_summary,
            "area": area_summary,
            "updated_at": TODAY.isoformat(),
        }

        if area_summary:
            ctx = sub_cluster_ctx[hifld_id]
            rec["area_cluster"] = {
                "size": max(ctx["sizes"]) if ctx["sizes"] else None,
                "county": next(iter(ctx["counties"])) if ctx["counties"] else None,
                "voltage_kv": next(iter(ctx["voltages"])) if ctx["voltages"] else None,
            }
        aggregated.append(rec)

    def sort_key(r):
        c_mw = r["confirmed"]["active_mw"] if r.get("confirmed") else 0
        a_mw = r["area"]["active_mw"] if r.get("area") else 0
        return -(c_mw + a_mw)
    aggregated.sort(key=sort_key)

    (OUT / "substation_queue_load.json").write_text(json.dumps(aggregated, default=str))

    print(f"Aggregated rows: {len(aggregated):,}")
    n_confirmed = sum(1 for r in aggregated if r.get("confirmed"))
    n_area = sum(1 for r in aggregated if r.get("area"))
    n_both = sum(1 for r in aggregated if r.get("confirmed") and r.get("area"))
    print(f"  with confirmed bucket: {n_confirmed:,}")
    print(f"  with area bucket:      {n_area:,}")
    print(f"  with BOTH:             {n_both:,}")
    print(f"  confirmed-only:        {n_confirmed - n_both:,}")
    print(f"  area-only:             {n_area - n_both:,}")

    # ── County-level rollup ────────────────────────────────────────────────
    # Aggregates queue projects by (state, county). Uses 100% of normalized
    # data — no matching uncertainty, no cluster cap. Designed to power the
    # Site Analyzer's "County Power Queue" section.
    print("\nBuilding county rollup...")
    county_buckets = defaultdict(empty_bucket)
    county_meta = {}
    for p in matched:
        state = p.get("state")
        county = p.get("county")
        if not state or not county:
            continue
        key = (state, county)
        capacity = p.get("capacity_mw") or 0
        status = p["status"]
        proj_record = {
            "queue_id": p.get("queue_id"),
            "name": p.get("project_name") or p.get("queue_id"),
            "mw": capacity,
            "fuel": p["fuel"],
            "cod": (p.get("proposed_cod") or "")[:10] or None,
            "queue_date": date_or_none(p.get("queue_date")),
            "in_service_date": date_or_none(p.get("in_service_date")),
            "withdrawn_date": date_or_none(p.get("withdrawn_date")),
            "proposed_cod": date_or_none(p.get("proposed_cod")),
            "voltage_kv": (p.get("poi") or {}).get("voltage_kv"),
            "status": status,
        }
        bucket = county_buckets[key]
        if status in ("ACTIVE", "UNDER_CONSTRUCTION", "SUSPENDED"):
            bucket["active_projects"].append(proj_record)
        elif status == "IN_SERVICE":
            bucket["in_service_projects"].append(proj_record)
        elif status == "WITHDRAWN" and proj_record["withdrawn_date"] and proj_record["withdrawn_date"] >= WINDOW_5Y_AGO:
            bucket["withdrawn_5y_projects"].append(proj_record)
        # Track which ISO dominates this county
        county_meta.setdefault(key, {"isos": defaultdict(int)})
        county_meta[key]["isos"][p["iso"]] += capacity if status in ("ACTIVE", "UNDER_CONSTRUCTION", "SUSPENDED") else 0

    counties = []
    for (state, county), bucket in county_buckets.items():
        active = bucket["active_projects"]
        in_serv = bucket["in_service_projects"]
        wd5y = bucket["withdrawn_5y_projects"]
        if not (active or in_serv or wd5y):
            continue

        active_mw = sum(p["mw"] for p in active)
        in_service_mw = sum(p["mw"] for p in in_serv)
        withdrawn_mw_5y = sum(p["mw"] for p in wd5y)

        # Withdrawal rate
        denom = len(wd5y) + len(in_serv) + len(active)
        withdrawal_rate = round(len(wd5y) / denom, 3) if denom >= 3 else None

        # Median time to COD
        cod_days = []
        for p in in_serv:
            qd, isd = p.get("queue_date"), p.get("in_service_date")
            if qd and isd:
                d = (isd - qd).days
                if 90 < d < 365 * 15:
                    cod_days.append(d)
        median_cod = round(statistics.median(cod_days)) if len(cod_days) >= 3 else None

        # Earliest active COD
        cods = [p["proposed_cod"] for p in active if p.get("proposed_cod")]
        earliest = min(cods).isoformat() if cods else None

        # Fuel mix (% of active MW per fuel)
        fuel_mw = defaultdict(float)
        for p in active:
            fuel_mw[p["fuel"]] += p["mw"]
        fuel_mix = (
            {f: round(mw / active_mw, 3) for f, mw in fuel_mw.items()}
            if active_mw > 0 else {}
        )

        # Voltage class mix (% of active MW per voltage class)
        volt_mw = defaultdict(float)
        for p in active:
            v = p.get("voltage_kv")
            if v:
                volt_mw[str(int(v))] += p["mw"]
        # Fraction relative to active MW *with known voltage*
        known_volt_mw = sum(volt_mw.values())
        voltage_mix = (
            {v: round(mw / known_volt_mw, 3) for v, mw in volt_mw.items()}
            if known_volt_mw > 0 else {}
        )

        # Top 10 active by full MW
        top_active = sorted(active, key=lambda p: -(p["mw"] or 0))[:10]
        top_active_out = [
            {
                "name": p["name"],
                "mw": p["mw"],
                "fuel": p["fuel"],
                "cod": p["cod"],
                "voltage_kv": p.get("voltage_kv"),
            }
            for p in top_active
        ]

        # Dominant ISO (by active MW)
        iso_tally = county_meta[(state, county)]["isos"]
        iso = max(iso_tally, key=iso_tally.get) if iso_tally else None

        # Sanitize county name for doc ID (lowercase, alphanumeric + underscore)
        import re
        county_slug = re.sub(r"[^a-z0-9]+", "_", county.lower()).strip("_")
        doc_id = f"{state}_{county_slug}"

        counties.append({
            "doc_id": doc_id,
            "state": state,
            "county": county,
            "iso": iso,
            "active_count": len(active),
            "active_mw": round(active_mw, 1),
            "in_service_count": len(in_serv),
            "in_service_mw": round(in_service_mw, 1),
            "withdrawn_count_5y": len(wd5y),
            "withdrawn_mw_5y": round(withdrawn_mw_5y, 1),
            "withdrawal_rate_5y": withdrawal_rate,
            "median_time_to_cod_days": median_cod,
            "completed_sample_size": len(cod_days),
            "earliest_active_cod": earliest,
            "fuel_mix": fuel_mix,
            "voltage_mix": voltage_mix,
            "top_active": top_active_out,
            "updated_at": TODAY.isoformat(),
        })

    counties.sort(key=lambda c: -c["active_mw"])
    (OUT / "county_queue_load.json").write_text(json.dumps(counties, default=str))
    print(f"County rollup: {len(counties):,} counties with queue activity")
    print(f"Total active MW (county sum): {sum(c['active_mw'] for c in counties):,.0f}")


if __name__ == "__main__":
    main()
