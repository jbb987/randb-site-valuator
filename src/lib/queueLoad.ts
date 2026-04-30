import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { CountyQueueLoad, SubstationQueueLoad } from '../types';

/**
 * One-shot fetch of a substation's interconnection-queue summary from Firestore.
 * Returns null if the substation has no attributed queue load.
 *
 * Refreshed weekly by the queue-ingestion pipeline — never subscribe; callers
 * should cache reads in-memory for the session.
 */
export async function getQueueLoad(hifldId: number): Promise<SubstationQueueLoad | null> {
  const ref = doc(db, 'substation_queue_load', String(hifldId));
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as SubstationQueueLoad) : null;
}

/** Sanitize a county name into a slug matching aggregate.py's logic. */
function countySlug(county: string): string {
  return county
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * One-shot fetch of a county's interconnection-queue summary from Firestore.
 * Doc ID format: "{state}_{county-slug}" — must match aggregate.py.
 * Returns null when the county has no queue activity (doc absent).
 */
export async function getCountyQueueLoad(
  state: string | null | undefined,
  county: string | null | undefined,
): Promise<CountyQueueLoad | null> {
  if (!state || !county) return null;
  const docId = `${state.toUpperCase()}_${countySlug(county)}`;
  const ref = doc(db, 'county_queue_load', docId);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as CountyQueueLoad) : null;
}
