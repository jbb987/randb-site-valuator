"""
Delete orphaned `substation_queue_load` documents in Firestore — those that
were written by a previous run but no longer exist in the current aggregate.

Why this is needed:
  write_to_firestore.py uses set() which only overwrites docs in the new
  output. Substations that were dropped (e.g. by the cluster-size cap) leave
  stale Firestore docs that the React card will read.

Run this AFTER write_to_firestore.py.
"""
import argparse
import json
import time
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore

DATA = Path(__file__).parent / "data"
COLL = "substation_queue_load"


def init_firebase(creds_path):
    if creds_path:
        cred = credentials.Certificate(creds_path)
    else:
        cred = credentials.ApplicationDefault()
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)
    return firestore.client()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--credentials", help="Path to service-account JSON")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    new_data = json.loads((DATA / "substation_queue_load.json").read_text())
    keep_ids = {str(d["hifld_id"]) for d in new_data}
    print(f"Current aggregate has {len(keep_ids):,} substations")

    db = init_firebase(args.credentials)
    coll = db.collection(COLL)

    print(f"Listing existing Firestore docs in {COLL}...")
    t0 = time.time()
    existing_ids = []
    for snap in coll.select([]).stream():
        existing_ids.append(snap.id)
    print(f"  {len(existing_ids):,} docs in Firestore ({time.time()-t0:.1f}s)")

    orphan_ids = [d for d in existing_ids if d not in keep_ids]
    print(f"  Orphans (to delete): {len(orphan_ids):,}")

    if not orphan_ids:
        print("Nothing to delete.")
        return 0

    if args.dry_run:
        print(f"DRY RUN — would delete {len(orphan_ids)} docs (sample: {orphan_ids[:10]})")
        return 0

    # Batch delete (max 500 per batch)
    BATCH = 450
    deleted = 0
    for i in range(0, len(orphan_ids), BATCH):
        batch = db.batch()
        chunk = orphan_ids[i:i + BATCH]
        for doc_id in chunk:
            batch.delete(coll.document(doc_id))
        batch.commit()
        deleted += len(chunk)
        if deleted % 5000 == 0 or deleted == len(orphan_ids):
            print(f"  deleted {deleted:,}/{len(orphan_ids):,}")
    print(f"\n✓ Deleted {deleted:,} orphan docs.")


if __name__ == "__main__":
    main()
