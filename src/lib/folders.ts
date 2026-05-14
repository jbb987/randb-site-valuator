import {
  collection,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import { FOLDERS_COLLECTION, type Folder } from '../types';

/** Position step. New folders are appended at parent-end with `(maxPosition + STEP)`.
 *  Step is large so drag-and-drop reorders can insert a midpoint without renumbering. */
const POSITION_STEP = 1000;

function foldersRef() {
  return collection(db, FOLDERS_COLLECTION);
}

/** Ancestor chain helper. Given the parent folder (or null for a root-level
 *  folder), returns the new folder's `ancestorFolderIds` — the parent's
 *  ancestors + the parent itself. Root folders have an empty array. */
export function deriveAncestorFolderIds(parent: Folder | null): string[] {
  if (!parent) return [];
  return [...parent.ancestorFolderIds, parent.id];
}

export interface CreateFolderInput {
  companyId: string;
  projectId?: string;
  parentFolderId: string | null;
  name: string;
  kind: Folder['kind'];
  systemRole?: Folder['systemRole'];
  templateOrigin?: string;
  createdBy: string;
  viewerUserIds?: string[];
  editorUserIds?: string[];
}

/** Create a folder. Caller must pass `parentFolder` so we can derive the
 *  ancestor chain — letting the lib re-fetch the parent inside this function
 *  would race with optimistic UI updates. `null` means "creating a root folder
 *  at customer or project root." */
export async function createFolder(
  input: CreateFolderInput,
  parentFolder: Folder | null,
): Promise<string> {
  const id = doc(foldersRef()).id;
  const now = Date.now();
  const folder: Folder = {
    id,
    companyId: input.companyId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    parentFolderId: input.parentFolderId,
    ancestorFolderIds: deriveAncestorFolderIds(parentFolder),
    name: input.name,
    position: now, // First-pass: use ms-since-epoch as a sortable append default
    kind: input.kind,
    ...(input.systemRole ? { systemRole: input.systemRole } : {}),
    ...(input.templateOrigin ? { templateOrigin: input.templateOrigin } : {}),
    createdAt: now,
    createdBy: input.createdBy,
    updatedAt: now,
    updatedBy: input.createdBy,
    ...(input.viewerUserIds ? { viewerUserIds: input.viewerUserIds } : {}),
    ...(input.editorUserIds ? { editorUserIds: input.editorUserIds } : {}),
  };
  await setDoc(doc(db, FOLDERS_COLLECTION, id), folder);
  return id;
}

/** Partial update on a folder. Caller is responsible for re-deriving
 *  `ancestorFolderIds` when changing `parentFolderId` (use `moveFolder` for
 *  that — it handles the descendant backfill too). */
export async function updateFolder(
  id: string,
  updates: Partial<Folder>,
  updatedBy: string,
): Promise<void> {
  await updateDoc(doc(db, FOLDERS_COLLECTION, id), {
    ...updates,
    updatedAt: Date.now(),
    updatedBy,
  });
}

/** Archive a folder. Sets `archivedAt`/`archivedBy`. Does NOT recursively
 *  archive children — restore semantics (per plan §4.2) require independent
 *  child state. Use `cascadeArchiveFolder` if you want the recursive form. */
export async function archiveFolder(
  id: string,
  archivedBy: string,
  reason?: string,
): Promise<void> {
  await updateDoc(doc(db, FOLDERS_COLLECTION, id), {
    archivedAt: Date.now(),
    archivedBy,
    ...(reason ? { archivedReason: reason } : {}),
    updatedAt: Date.now(),
    updatedBy: archivedBy,
  });
}

/** Restore a single folder. Per plan §4.2, children remain in their own
 *  archived state — restoring a folder does not unarchive its descendants. */
export async function restoreFolder(id: string, restoredBy: string): Promise<void> {
  await updateDoc(doc(db, FOLDERS_COLLECTION, id), {
    archivedAt: null,
    archivedBy: null,
    archivedReason: null,
    updatedAt: Date.now(),
    updatedBy: restoredBy,
  });
}

export async function getFolder(id: string): Promise<Folder | null> {
  const snap = await getDoc(doc(db, FOLDERS_COLLECTION, id));
  return snap.exists() ? (snap.data() as Folder) : null;
}

/** Subscribe to every (non-archived by default) folder under a customer.
 *  Caller filters by parentFolderId/projectId in memory — full customer
 *  subtrees are small enough that a single subscription beats many. */
export function subscribeFoldersByCompany(
  companyId: string,
  callback: (folders: Folder[]) => void,
  options: { includeArchived?: boolean } = {},
  onError?: (err: Error) => void,
): Unsubscribe {
  const constraints = [where('companyId', '==', companyId), orderBy('position', 'asc')];
  const q = query(foldersRef(), ...constraints);
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as Folder);
      const filtered = options.includeArchived
        ? list
        : list.filter((f) => !f.archivedAt);
      callback(filtered);
    },
    (err) => {
      console.error('[folders] subscribe error:', err);
      onError?.(err);
    },
  );
}

/** Subscribe to a single folder by id. */
export function subscribeFolder(
  id: string,
  callback: (folder: Folder | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, FOLDERS_COLLECTION, id),
    (snap) => callback(snap.exists() ? (snap.data() as Folder) : null),
    (err) => {
      console.error('[folders] subscribe single error:', err);
      onError?.(err);
    },
  );
}

export { POSITION_STEP };
