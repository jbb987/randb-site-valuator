import {
  collection,
  deleteField,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  onSnapshot,
  query,
  where,
  type FieldValue,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  PRECON_SITES_COLLECTION,
  type PreConSite,
  type PreConEngineerStatus,
  type PreConLoaStatus,
} from '../types';
import { provisionPreConFolders } from './projectProvisioning';
import { createSiteEntry, updateSiteEntry } from './siteRegistry';

function sitesRef() {
  return collection(db, PRECON_SITES_COLLECTION);
}

export interface CreatePreConSiteInput {
  companyId: string;
  name: string;
  coordinates: { lat: number; lng: number };
  acreage: number;
  createdBy: string;
}

/** Create a pre-con site end-to-end:
 *    1. Create a SiteRegistryEntry (no appraisal yet — MW comes from the
 *       engineer review, $/acre from the Site Analyzer's valuation form)
 *    2. Provision the pre-con folder skeleton + Project(type='pre-con')
 *    3. Create the PreConSite doc, wiring all the FKs
 *
 *  Returns the PreConSite id (which is also reused as the Project id, mirroring
 *  Construction Tracker's pattern). */
export async function createPreConSite(input: CreatePreConSiteInput): Promise<string> {
  const id = doc(sitesRef()).id;
  const now = Date.now();

  // 1. Site Registry entry — appraisal inputs filled in later (MW via engineer
  // review, $/acre via Site Analyzer). Initialize the required numeric fields
  // to 0 so the entry validates.
  const siteRegistryId = await createSiteEntry({
    name: input.name || 'Untitled Pre-Con Site',
    address: '',
    coordinates: { lat: input.coordinates.lat, lng: input.coordinates.lng },
    acreage: input.acreage,
    mwCapacity: 0,
    dollarPerAcreLow: 0,
    dollarPerAcreHigh: 0,
    companyId: input.companyId,
    createdBy: input.createdBy,
    memberIds: [input.createdBy],
  });

  // 2. Folder skeleton + Project record (use the PreConSite id as the Project id)
  const { rootFolderId, projectId } = await provisionPreConFolders({
    companyId: input.companyId,
    siteId: id,
    siteName: input.name,
    createdBy: input.createdBy,
  });

  // 3. PreConSite record
  const site: PreConSite = {
    id,
    companyId: input.companyId,
    name: input.name || 'Untitled Pre-Con Site',
    coordinates: input.coordinates,
    siteRegistryId,
    projectId,
    rootFolderId,
    engineerReviewStatus: 'not-requested',
    loaStatus: 'not-started',
    loaSteps: [],
    createdAt: now,
    createdBy: input.createdBy,
    updatedAt: now,
  };
  await setDoc(doc(db, PRECON_SITES_COLLECTION, id), site);
  return id;
}

/** Partial update accepting FieldValue sentinels (e.g. `deleteField()`) so
 *  callers can explicitly clear a field. Firestore rejects literal `undefined`
 *  values — callers should never put `undefined` in this object. */
export type PreConSiteUpdate = {
  [K in keyof PreConSite]?: PreConSite[K] | FieldValue;
};

export async function updatePreConSite(
  id: string,
  updates: PreConSiteUpdate,
): Promise<void> {
  await updateDoc(doc(db, PRECON_SITES_COLLECTION, id), {
    ...updates,
    updatedAt: Date.now(),
  });
}

export async function archivePreConSite(id: string): Promise<void> {
  await updateDoc(doc(db, PRECON_SITES_COLLECTION, id), {
    archivedAt: Date.now(),
    updatedAt: Date.now(),
  });
}

export async function restorePreConSite(id: string): Promise<void> {
  await updateDoc(doc(db, PRECON_SITES_COLLECTION, id), {
    archivedAt: null,
    updatedAt: Date.now(),
  });
}

export async function getPreConSite(id: string): Promise<PreConSite | null> {
  const snap = await getDoc(doc(db, PRECON_SITES_COLLECTION, id));
  return snap.exists() ? (snap.data() as PreConSite) : null;
}

export function subscribePreConSites(
  callback: (sites: PreConSite[]) => void,
  options: { includeArchived?: boolean } = {},
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    sitesRef(),
    (snap) => {
      const list = snap.docs.map((d) => d.data() as PreConSite);
      list.sort((a, b) => a.name.localeCompare(b.name));
      const filtered = options.includeArchived ? list : list.filter((s) => !s.archivedAt);
      callback(filtered);
    },
    (err) => {
      console.error('[preConSites] subscribe error:', err);
      onError?.(err);
    },
  );
}

export function subscribePreConSitesByCompany(
  companyId: string,
  callback: (sites: PreConSite[]) => void,
  options: { includeArchived?: boolean } = {},
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(sitesRef(), where('companyId', '==', companyId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as PreConSite);
      list.sort((a, b) => a.name.localeCompare(b.name));
      const filtered = options.includeArchived ? list : list.filter((s) => !s.archivedAt);
      callback(filtered);
    },
    (err) => {
      console.error('[preConSites] subscribe by company error:', err);
      onError?.(err);
    },
  );
}

export function subscribePreConSite(
  id: string,
  callback: (site: PreConSite | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, PRECON_SITES_COLLECTION, id),
    (snap) => callback(snap.exists() ? (snap.data() as PreConSite) : null),
    (err) => {
      console.error('[preConSites] subscribe single error:', err);
      onError?.(err);
    },
  );
}

// ── Workflow helpers (write the right fields together) ──────────────────

export interface SaveSiteStatusInput {
  engineerReviewerId: string | undefined;
  verifiedMW: number | undefined;
  grade: PreConSite['grade'] | undefined;
  userId: string;
  /** Previous values to detect what changed, so we only stamp timestamps when
   *  they actually shift. The card always sends the full triple; the diff is
   *  computed here. */
  previous: Pick<
    PreConSite,
    'engineerReviewerId' | 'engineerVerifiedMW' | 'grade' | 'engineerReviewStatus'
  >;
}

/** Single write that covers the merged Site Status card: engineer assignment,
 *  verified MW, and grade. Derives `engineerReviewStatus` from the resulting
 *  field combination so the LOA gate + audit history stay consistent without
 *  the user having to think about it. Also pushes verifiedMW through to the
 *  linked sites-registry entry so the appraisal can pick it up. */
export async function saveSiteStatus(
  siteId: string,
  siteRegistryId: string,
  input: SaveSiteStatusInput,
): Promise<void> {
  const { engineerReviewerId, verifiedMW, grade, userId, previous } = input;
  const now = Date.now();
  const updates: PreConSiteUpdate = {};

  // Firestore rejects literal `undefined` values, so use `deleteField()` when
  // the user is clearing a previously-set field.
  if (engineerReviewerId !== previous.engineerReviewerId) {
    updates.engineerReviewerId = engineerReviewerId ?? deleteField();
  }
  if (verifiedMW !== previous.engineerVerifiedMW) {
    updates.engineerVerifiedMW = verifiedMW ?? deleteField();
  }
  const gradeChanged = grade !== previous.grade;
  if (gradeChanged) {
    updates.grade = grade ?? deleteField();
    if (grade) {
      updates.gradedAt = now;
      updates.gradedBy = userId;
    }
  }

  // Derive engineerReviewStatus from the resulting field combination.
  const nextStatus: PreConEngineerStatus = !engineerReviewerId
    ? 'not-requested'
    : !grade
      ? 'requested'
      : grade === 'no-go'
        ? 'rejected'
        : 'approved';

  if (nextStatus !== previous.engineerReviewStatus) {
    updates.engineerReviewStatus = nextStatus;
    if (nextStatus === 'requested') updates.engineerRequestedAt = now;
    if (nextStatus === 'approved' || nextStatus === 'rejected') {
      updates.engineerCompletedAt = now;
    }
  }

  if (Object.keys(updates).length > 0) {
    await updatePreConSite(siteId, updates);
  }

  // Mirror the verified MW into the linked registry entry so the appraisal
  // can use it without manual re-entry. Only when MW actually changed.
  if (verifiedMW !== undefined && verifiedMW !== previous.engineerVerifiedMW) {
    await updateSiteEntry(siteRegistryId, { mwCapacity: verifiedMW });
  }
}

export async function advanceLoaStatus(
  siteId: string,
  next: PreConLoaStatus,
  steps: PreConSite['loaSteps'],
): Promise<void> {
  await updatePreConSite(siteId, { loaStatus: next, loaSteps: steps });
}
