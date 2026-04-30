import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { SubstationQueueLoad } from '../types';

/**
 * One-shot fetch of a substation's interconnection-queue summary from Firestore.
 * Returns null if the substation has no attributed queue load (the document
 * doesn't exist).
 *
 * Data is refreshed weekly by the queue-ingestion GitHub Action — never
 * subscribe to it; callers should cache reads in-memory for the session.
 */
export async function getQueueLoad(hifldId: number): Promise<SubstationQueueLoad | null> {
  const ref = doc(db, 'substation_queue_load', String(hifldId));
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as SubstationQueueLoad) : null;
}
