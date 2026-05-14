import {
  collection,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  CUSTOMER_PROJECTS_COLLECTION,
  type Project,
  type ProjectStatus,
  type ProjectType,
} from '../types';

function projectsRef() {
  return collection(db, CUSTOMER_PROJECTS_COLLECTION);
}

export interface CreateProjectInput {
  companyId: string;
  type: ProjectType;
  name: string;
  status?: ProjectStatus;
  rootFolderId: string; // Caller must pre-create the root folder and pass its id
  startDate?: number;
  endDate?: number;
  parentProjectId?: string;
  siteId?: string;
  createdBy: string;
}

export async function createProject(input: CreateProjectInput): Promise<string> {
  const id = doc(projectsRef()).id;
  const now = Date.now();
  const project: Project = {
    id,
    companyId: input.companyId,
    type: input.type,
    name: input.name,
    status: input.status ?? 'active',
    rootFolderId: input.rootFolderId,
    ...(input.startDate ? { startDate: input.startDate } : {}),
    ...(input.endDate ? { endDate: input.endDate } : {}),
    ...(input.parentProjectId ? { parentProjectId: input.parentProjectId } : {}),
    ...(input.siteId ? { siteId: input.siteId } : {}),
    createdAt: now,
    createdBy: input.createdBy,
    updatedAt: now,
    updatedBy: input.createdBy,
  };
  await setDoc(doc(db, CUSTOMER_PROJECTS_COLLECTION, id), project);
  return id;
}

export async function updateProject(
  id: string,
  updates: Partial<Project>,
  updatedBy: string,
): Promise<void> {
  await updateDoc(doc(db, CUSTOMER_PROJECTS_COLLECTION, id), {
    ...updates,
    updatedAt: Date.now(),
    updatedBy,
  });
}

/** Archive a project. Sets archivedAt on the project record. Per plan §4.3,
 *  archiving a project should also recursively archive every folder/document
 *  under its `rootFolderId` — that cascade is done by the caller (a Cloud
 *  Function or batched client write), not here. */
export async function archiveProject(
  id: string,
  archivedBy: string,
  reason?: string,
): Promise<void> {
  await updateDoc(doc(db, CUSTOMER_PROJECTS_COLLECTION, id), {
    archivedAt: Date.now(),
    archivedBy,
    ...(reason ? { archivedReason: reason } : {}),
    updatedAt: Date.now(),
    updatedBy: archivedBy,
  });
}

export async function restoreProject(id: string, restoredBy: string): Promise<void> {
  await updateDoc(doc(db, CUSTOMER_PROJECTS_COLLECTION, id), {
    archivedAt: null,
    archivedBy: null,
    archivedReason: null,
    updatedAt: Date.now(),
    updatedBy: restoredBy,
  });
}

export async function getProject(id: string): Promise<Project | null> {
  const snap = await getDoc(doc(db, CUSTOMER_PROJECTS_COLLECTION, id));
  return snap.exists() ? (snap.data() as Project) : null;
}

export function subscribeProjectsByCompany(
  companyId: string,
  callback: (projects: Project[]) => void,
  options: { includeArchived?: boolean } = {},
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(projectsRef(), where('companyId', '==', companyId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as Project);
      list.sort((a, b) => a.name.localeCompare(b.name));
      const filtered = options.includeArchived
        ? list
        : list.filter((p) => !p.archivedAt);
      callback(filtered);
    },
    (err) => {
      console.error('[projects] subscribe error:', err);
      onError?.(err);
    },
  );
}

export function subscribeProject(
  id: string,
  callback: (project: Project | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, CUSTOMER_PROJECTS_COLLECTION, id),
    (snap) => callback(snap.exists() ? (snap.data() as Project) : null),
    (err) => {
      console.error('[projects] subscribe single error:', err);
      onError?.(err);
    },
  );
}
