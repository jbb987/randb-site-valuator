"""
Per-substation aggregation. For each HIFLD substation that has matched
queue projects, compute:
  - active_count, active_mw
  - in_service_count, in_service_mw
  - withdrawn_count_5y, withdrawn_mw_5y    # rolling 5-year window
  - withdrawal_rate_5y                     # withdrawn_5y / (withdrawn_5y + in_service + active_with_cod)
  - earliest_active_cod
  - median_time_to_cod_days                # null if <3 completed projects
  - top_active_projects                    # up to 3 by MW

Apportionment:
  - SUBSTATION single match     -> 100% to that substation
  - SUBSTATION cluster (MULTI)  -> equal split across cluster members
  - LINE_TAP (2 substations)    -> 50/50 to each endpoint
  - LINE_TAP (1 substation)     -> 100% to the one matched
"""
import json
import statistics
from datetime import date, timedelta
from pathlib import Path
from collections import defaultdict


TODAY = date.today()
WINDOW_5Y_AGO = TODAY - timedelta(days=5 * 365)


def date_or_none(s):
    if not s:
        return None
    try:
        return date.fromisoformat(str(s)[:10])
    except Exception:
        return None


def main():
    OUT = Path(__file__).parent / "data"
    matched = json.loads((OUT / "all_matched.json").read_text())

    # sub_data[hifld_id] = list of {project_share, ...}
    sub_data = defaultdict(list)

    for p in matched:
        if not p.get("match"):
            continue
        n = len(p["match"])
        share = 1.0 / n
        for m in p["match"]:
            sub_data[m["hifld_id"]].append({
                "share": share,
                "iso": p["iso"],
                "queue_id": p["queue_id"],
                "project_name": p.get("project_name"),
                "status": p["status"],
                "capacity_mw": p.get("capacity_mw") or 0,
                "fuel": p["fuel"],
                "queue_date": date_or_none(p.get("queue_date")),
                "in_service_date": date_or_none(p.get("in_service_date")),
                "withdrawn_date": date_or_none(p.get("withdrawn_date")),
                "proposed_cod": date_or_none(p.get("proposed_cod")),
                "transmission_owner": p.get("transmission_owner"),
                "_match_name": m["name"],
                "_lat": m.get("lat"),
                "_lng": m.get("lng"),
            })

    print(f"Substations with matched queue load: {len(sub_data):,}")

    aggregated = []
    for hifld_id, projects in sub_data.items():
        # Counts and MW per status (apportioned)
        active_count = active_mw = 0.0
        in_service_count = in_service_mw = 0.0
        wd_count_total = wd_mw_total = 0.0
        wd_count_5y = wd_mw_5y = 0.0

        cod_days = []                # for median_time_to_cod
        active_cods = []
        active_projects = []         # for top-3
        first_iso = None
        sub_name = None
        sub_lat = sub_lng = None

        for proj in projects:
            share = proj["share"]
            cap = proj["capacity_mw"] * share
            sub_name = sub_name or proj["_match_name"]
            sub_lat = sub_lat or proj["_lat"]
            sub_lng = sub_lng or proj["_lng"]
            first_iso = first_iso or proj["iso"]

            if proj["status"] == "ACTIVE" or proj["status"] == "UNDER_CONSTRUCTION" or proj["status"] == "SUSPENDED":
                active_count += share
                active_mw += cap
                if proj["proposed_cod"]:
                    active_cods.append(proj["proposed_cod"])
                active_projects.append({
                    "name": proj["project_name"] or proj["queue_id"],
                    "mw": proj["capacity_mw"],
                    "fuel": proj["fuel"],
                    "cod": proj["proposed_cod"].isoformat() if proj["proposed_cod"] else None,
                    "share": share,
                })
            elif proj["status"] == "IN_SERVICE":
                in_service_count += share
                in_service_mw += cap
                if proj["queue_date"] and proj["in_service_date"]:
                    days = (proj["in_service_date"] - proj["queue_date"]).days
                    if 90 < days < 365 * 15:  # sanity: 3 months to 15 years
                        cod_days.append(days)
            elif proj["status"] == "WITHDRAWN":
                wd_count_total += share
                wd_mw_total += cap
                if proj["withdrawn_date"] and proj["withdrawn_date"] >= WINDOW_5Y_AGO:
                    wd_count_5y += share
                    wd_mw_5y += cap

        # Withdrawal rate (5y) — denominator includes recent withdrawals + in-service + active
        # Active projects with no signed IA shouldn't count toward "had a chance to withdraw"
        # but we don't always have that detail; use all active as approximation for now.
        denom_5y = wd_count_5y + in_service_count + active_count
        withdrawal_rate_5y = (wd_count_5y / denom_5y) if denom_5y >= 3 else None

        # Median time to COD (days) — only if 3+ completed
        median_cod = round(statistics.median(cod_days)) if len(cod_days) >= 3 else None

        # Earliest active COD
        earliest = min(active_cods).isoformat() if active_cods else None

        # Top 3 active by MW (full project MW, not apportioned)
        top3 = sorted(active_projects, key=lambda x: -(x["mw"] or 0))[:3]

        # Skip if nothing meaningful
        if (active_count + in_service_count + wd_count_total) == 0:
            continue

        aggregated.append({
            "hifld_id": hifld_id,
            "iso": first_iso,
            "name": sub_name,
            "lat": sub_lat,
            "lng": sub_lng,
            "active_count": round(active_count, 2),
            "active_mw": round(active_mw, 1),
            "in_service_count": round(in_service_count, 2),
            "in_service_mw": round(in_service_mw, 1),
            "withdrawn_count_5y": round(wd_count_5y, 2),
            "withdrawn_mw_5y": round(wd_mw_5y, 1),
            "withdrawn_count_total": round(wd_count_total, 2),
            "withdrawn_mw_total": round(wd_mw_total, 1),
            "withdrawal_rate_5y": round(withdrawal_rate_5y, 3) if withdrawal_rate_5y is not None else None,
            "median_time_to_cod_days": median_cod,
            "completed_sample_size": len(cod_days),
            "earliest_active_cod": earliest,
            "top_active": top3,
            "updated_at": TODAY.isoformat(),
        })

    aggregated.sort(key=lambda x: -x["active_mw"])
    (OUT / "substation_queue_load.json").write_text(json.dumps(aggregated, default=str))

    print(f"Aggregated rows: {len(aggregated):,}")
    print(f"Active MW total: {sum(x['active_mw'] for x in aggregated):,.0f}")
    print(f"With withdrawal rate computed: {sum(1 for x in aggregated if x['withdrawal_rate_5y'] is not None):,}")
    print(f"With median COD computed:      {sum(1 for x in aggregated if x['median_time_to_cod_days'] is not None):,}")

    print("\nTop 15 substations by active MW (all ISOs):")
    print(f"  {'ISO':5s} {'HIFLD':>7s} {'Name':40s} {'Active':>7s} {'Wd5y':>6s} {'WdRate':>7s} {'MedCOD':>7s}")
    for s in aggregated[:15]:
        rate = f"{s['withdrawal_rate_5y']:.0%}" if s["withdrawal_rate_5y"] is not None else "—"
        cod = f"{s['median_time_to_cod_days']/365:.1f}y" if s["median_time_to_cod_days"] else "—"
        name = (s["name"] or "—")[:40]
        print(f"  {s['iso']:5s} {s['hifld_id']:>7} {name:40s} {s['active_mw']:>6.0f}MW {s['withdrawn_mw_5y']:>5.0f}MW {rate:>7s} {cod:>7s}")


if __name__ == "__main__":
    main()
