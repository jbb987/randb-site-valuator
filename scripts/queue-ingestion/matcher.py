"""
Match normalized queue rows to HIFLD substations using state + county +
voltage class with name fuzzy as tiebreaker.

Returns each project enriched with `match` (list of HIFLD records) and
`match_method`.
"""
import json
import re
import sys
from pathlib import Path
from collections import defaultdict, Counter
from rapidfuzz import fuzz, process

sys.path.insert(0, str(Path(__file__).parent))


def _norm(s):
    return s.strip().lower() if s else None


def _strip_county_word(s):
    if not s:
        return None
    return re.sub(r"\s+(county|parish|borough|census area)\s*$", "", s, flags=re.I).strip()


def _is_real_name(name):
    if not name:
        return False
    n = name.upper().strip()
    if n.startswith("UNKNOWN") or n.startswith("TAP") or n in ("SUB", "STATION"):
        return False
    if re.match(r"^SUB\s*T?\d*$", n):
        return False
    return True


def _voltage_match(poi_kv, h):
    if poi_kv is None:
        return True
    minv = h.get("min_volt_kv") or 0
    maxv = h.get("max_volt_kv") or 0
    if maxv <= 0:
        return True
    return (minv - 15) <= poi_kv <= (maxv + 15)


def _name_score(query, h):
    if not _is_real_name(h["name"]):
        return 0
    return fuzz.token_set_ratio(query.lower(), h["name"].lower())


class Matcher:
    def __init__(self, hifld_records):
        self.hifld = hifld_records
        self.county_index = defaultdict(list)
        self.state_index = defaultdict(list)
        for h in hifld_records:
            if not h.get("state"):
                continue
            self.state_index[h["state"]].append(h)
            county = _norm(_strip_county_word(h.get("county")))
            if county:
                self.county_index[(h["state"], county)].append(h)

    # ── Single-substation match ───────────────────────────────────────
    def _match_substation(self, state, county, voltage, name):
        if not state:
            return None, "NONE", 0

        county_l = _norm(county)
        candidates_v = []
        if county:
            candidates = self.county_index.get((state, county_l), [])
            candidates_v = [h for h in candidates if _voltage_match(voltage, h)]

        if len(candidates_v) == 1:
            h = candidates_v[0]
            if name and _is_real_name(h["name"]) and _name_score(name, h) >= 85:
                return h, "EXACT", 95
            return h, "HIGH", 85

        if len(candidates_v) > 1:
            if name:
                scored = sorted(candidates_v, key=lambda h: _name_score(name, h), reverse=True)
                top = scored[0]
                ts = _name_score(name, top)
                if ts >= 85:
                    return top, "MEDIUM", min(80 + (ts - 85), 90)
            return {"_cluster": candidates_v}, "MULTI_AMBIGUOUS", 50

        # County-only fallback
        if county:
            county_only = self.county_index.get((state, county_l), [])
            if county_only and name:
                scored = sorted(county_only, key=lambda h: _name_score(name, h), reverse=True)
                top = scored[0]
                ts = _name_score(name, top)
                if ts >= 85:
                    return top, "COUNTY_ONLY_NAME", 65
            if len(county_only) == 1:
                return county_only[0], "COUNTY_ONLY_UNIQUE", 60

        # State-only fallback
        if name:
            state_subs = self.state_index.get(state, [])
            named_state = [h for h in state_subs if _is_real_name(h["name"])]
            if named_state:
                best = process.extractOne(
                    name.lower(),
                    [h["name"].lower() for h in named_state],
                    scorer=fuzz.token_set_ratio,
                )
                if best and best[1] >= 90:
                    return named_state[best[2]], "STATE_ONLY", 50

        return None, "NONE", 0

    # ── Tap endpoint match (state-wide, name-based) ───────────────────
    def _match_tap_endpoint(self, state, voltage, ep, county_hint):
        state_subs = self.state_index.get(state, [])
        named_state = [h for h in state_subs if _is_real_name(h["name"]) and _voltage_match(voltage, h)]
        if named_state:
            best = process.extractOne(
                ep.lower(),
                [h["name"].lower() for h in named_state],
                scorer=fuzz.token_set_ratio,
            )
            if best and best[1] >= 88:
                return named_state[best[2]], "TAP_EP_NAME", min(70 + (best[1] - 88), 90)
        # Fallback to county+voltage match using project's county
        h, m, c = self._match_substation(state, county_hint, voltage, ep)
        if h and not (isinstance(h, dict) and "_cluster" in h):
            return h, m, c
        return None, "NONE", 0

    # ── Top-level: process one project ────────────────────────────────
    def match(self, proj):
        poi = proj.get("poi")
        if not poi or poi["kind"] in ("UNKNOWN",) or not poi.get("endpoints"):
            return [], "NO_POI"

        voltage = poi["voltage_kv"]
        state = proj["state"]
        county = proj["county"]

        if poi["kind"] == "SUBSTATION":
            name = poi["endpoints"][0] if poi["endpoints"] else None
            h, method, conf = self._match_substation(state, county, voltage, name)
            if isinstance(h, dict) and "_cluster" in h:
                cluster = h["_cluster"]
                return ([{"hifld_id": c["hifld_id"], "name": c["name"], "lat": c["lat"], "lng": c["lng"],
                          "confidence": conf, "_cluster_size": len(cluster)} for c in cluster], method)
            if h:
                return ([{"hifld_id": h["hifld_id"], "name": h["name"], "lat": h["lat"], "lng": h["lng"],
                          "confidence": conf}], method)
            return [], method

        if poi["kind"] == "LINE_TAP":
            ms, methods = [], []
            for ep in poi["endpoints"]:
                h, m, c = self._match_tap_endpoint(state, voltage, ep, county)
                methods.append(m)
                if h:
                    ms.append({"hifld_id": h["hifld_id"], "name": h["name"], "endpoint": ep,
                               "lat": h["lat"], "lng": h["lng"], "confidence": c})
            # Dedup
            seen = set()
            unique = []
            for m in ms:
                if m["hifld_id"] not in seen:
                    seen.add(m["hifld_id"])
                    unique.append(m)
            ms = unique
            if len(ms) == 2:
                return ms, "TAP_BOTH"
            if len(ms) == 1:
                return ms, "TAP_ONE"
            return [], "TAP_NONE"

        return [], "NONE"


def main():
    OUT = Path(__file__).parent / "data"
    queue = json.loads((OUT / "all_normalized.json").read_text())
    hifld = json.loads((OUT / "HIFLD_us.json").read_text())
    matcher = Matcher(hifld)
    print(f"Loaded {len(queue):,} queue projects, {len(hifld):,} HIFLD substations.")
    print(f"County index size: {len(matcher.county_index):,} (state, county) pairs")
    print()

    out = []
    method_counts = Counter()
    iso_method_counts = defaultdict(Counter)
    for p in queue:
        match, method = matcher.match(p)
        method_counts[method] += 1
        iso_method_counts[p["iso"]][method] += 1
        out.append({**p, "match": match, "match_method": method})

    print(f"{'Method':25s} {'Count':>8s} {'%':>6s}")
    for m, n in sorted(method_counts.items(), key=lambda x: -x[1]):
        print(f"  {m:23s} {n:>8} {n*100/len(queue):>5.0f}%")

    # Per-ISO summary
    print("\nMatched (any) by ISO:")
    for iso in sorted(iso_method_counts):
        c = iso_method_counts[iso]
        total = sum(c.values())
        matched = sum(c[k] for k in ("EXACT", "HIGH", "MEDIUM", "MULTI_AMBIGUOUS",
                                      "COUNTY_ONLY_NAME", "COUNTY_ONLY_UNIQUE",
                                      "STATE_ONLY", "TAP_BOTH", "TAP_ONE"))
        print(f"  {iso:7s} matched={matched:>5}/{total} ({matched/total:.0%})")

    (OUT / "all_matched.json").write_text(json.dumps(out, default=str))
    print(f"\nSaved -> {OUT / 'all_matched.json'}")


if __name__ == "__main__":
    main()
