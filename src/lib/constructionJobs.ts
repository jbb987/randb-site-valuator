import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import type { ConstructionJob, LinkedCompany } from '../types';

const COLLECTION = 'construction-jobs';

function jobsRef() {
  return collection(db, COLLECTION);
}

/** Derive the linkedCompanyIds mirror from linkedCompanies. */
export function deriveLinkedCompanyIds(linked: LinkedCompany[]): string[] {
  return Array.from(new Set(linked.map((l) => l.companyId)));
}

/** Create a new construction job. Returns the generated ID. */
export async function createConstructionJob(
  entry: Omit<ConstructionJob, 'id' | 'createdAt' | 'updatedAt' | 'linkedCompanyIds'>,
): Promise<string> {
  const id = doc(jobsRef()).id;
  const now = Date.now();
  const full: ConstructionJob = {
    ...entry,
    id,
    linkedCompanyIds: deriveLinkedCompanyIds(entry.linkedCompanies),
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(doc(db, COLLECTION, id), full);
  return id;
}

/** Partial update on an existing job. Re-derives linkedCompanyIds when linkedCompanies changes. */
export async function updateConstructionJob(
  id: string,
  updates: Partial<ConstructionJob>,
): Promise<void> {
  const patch: Partial<ConstructionJob> = { ...updates, updatedAt: Date.now() };
  if (updates.linkedCompanies) {
    patch.linkedCompanyIds = deriveLinkedCompanyIds(updates.linkedCompanies);
  }
  await updateDoc(doc(db, COLLECTION, id), patch as Record<string, unknown>);
}

/** Delete a construction job. */
export async function deleteConstructionJob(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}

/** Fetch a single job by ID. */
export async function getConstructionJob(id: string): Promise<ConstructionJob | null> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? (snap.data() as ConstructionJob) : null;
}

/** Subscribe to real-time updates for the full construction-jobs collection. */
export function subscribeConstructionJobs(
  callback: (jobs: ConstructionJob[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    jobsRef(),
    (snap) => {
      const jobs = snap.docs.map((d) => d.data() as ConstructionJob);
      jobs.sort((a, b) => a.name.localeCompare(b.name));
      callback(jobs);
    },
    (err) => {
      console.error('[Firebase] Construction jobs subscription error:', err);
      onError?.(err);
    },
  );
}

/** Subscribe to a single job by ID. */
export function subscribeConstructionJob(
  id: string,
  callback: (job: ConstructionJob | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, COLLECTION, id),
    (snap) => callback(snap.exists() ? (snap.data() as ConstructionJob) : null),
    (err) => {
      console.error('[Firebase] Construction job subscription error:', err);
      onError?.(err);
    },
  );
}
