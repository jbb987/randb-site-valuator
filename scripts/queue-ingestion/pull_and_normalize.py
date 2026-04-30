"""
Pull all 7 ISO queues via gridstatus, normalize, save per-ISO + combined JSON.
"""
import os
import sys
import json
import time
import concurrent.futures as cf
from pathlib import Path

os.environ.setdefault("PJM_API_KEY", "dummy")

import gridstatus
sys.path.insert(0, str(Path(__file__).parent))
from normalizers import ALL as NORMALIZERS

OUT = Path(__file__).parent / "data"
OUT.mkdir(exist_ok=True)

ISO_CLASSES = {
    "PJM": gridstatus.PJM,
    "MISO": gridstatus.MISO,
    "ERCOT": gridstatus.Ercot,
    "SPP": gridstatus.SPP,
    "CAISO": gridstatus.CAISO,
    "NYISO": gridstatus.NYISO,
    "ISONE": gridstatus.ISONE,
}


def pull_one(iso, cls):
    t0 = time.time()
    try:
        df = cls().get_interconnection_queue()
        normalized = NORMALIZERS[iso].normalize(df)
        (OUT / f"{iso}.json").write_text(json.dumps(normalized, default=str))
        return {"iso": iso, "ok": True, "raw": len(df), "normalized": len(normalized),
                "elapsed_sec": round(time.time() - t0, 1)}
    except Exception as e:
        import traceback
        return {"iso": iso, "ok": False, "error": f"{type(e).__name__}: {e}",
                "trace": traceback.format_exc().splitlines()[-3:],
                "elapsed_sec": round(time.time() - t0, 1)}


def main():
    results = []
    with cf.ThreadPoolExecutor(max_workers=7) as ex:
        for fut in cf.as_completed({ex.submit(pull_one, n, c): n for n, c in ISO_CLASSES.items()}):
            r = fut.result()
            tag = "OK" if r["ok"] else "FAIL"
            print(f"[{tag}] {r['iso']:6s} raw={r.get('raw','-'):>5}  normalized={r.get('normalized','-'):>5}  ({r['elapsed_sec']}s)")
            if not r["ok"]:
                print(f"        {r['error']}")
            results.append(r)

    # Combine into one file for downstream
    combined = []
    for r in results:
        if r["ok"]:
            combined.extend(json.loads((OUT / f"{r['iso']}.json").read_text()))
    (OUT / "all_normalized.json").write_text(json.dumps(combined, default=str))
    (OUT / "pull_summary.json").write_text(json.dumps(results, indent=2, default=str))
    print(f"\nTotal normalized projects: {len(combined):,}")
    print(f"Output dir: {OUT}")


if __name__ == "__main__":
    main()
