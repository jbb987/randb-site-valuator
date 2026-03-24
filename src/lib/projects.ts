import {
  collection,
  doc,
  setDoc,
  updateDoc,
  getDocs,
  writeBatch,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import { SITE_REQUESTS_COLLECTION } from './siteRequests';
import type { Project } from '../types';

const COLLECTION = 'projects';
const SITES_COLLECTION = 'sites';

function projectsRef() {
  return collection(db, COLLECTION);
}

export async function saveProject(project: Project): Promise<void> {
  try {
    await setDoc(doc(db, COLLECTION, project.id), project);
  } catch (err) {
    console.error('[Firebase] Failed to save project:', err);
    throw err;
  }
}

export async function renameProjectInDB(id: string, name: string): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTION, id), { name, updatedAt: Date.now() });
  } catch (err) {
    console.error('[Firebase] Failed to rename project:', err);
    throw err;
  }
}

/**
 * Delete a project and cascade-delete all its sites and site requests.
 */
export async function deleteProjectCascade(projectId: string): Promise<void> {
  try {
    const [sitesSnapshot, requestsSnapshot] = await Promise.all([
      getDocs(query(collection(db, SITES_COLLECTION), where('inputs.projectId', '==', projectId))),
      getDocs(query(collection(db, SITE_REQUESTS_COLLECTION), where('projectId', '==', projectId))),
    ]);

    const batch = writeBatch(db);
    for (const siteDoc of sitesSnapshot.docs) {
      batch.delete(doc(db, SITES_COLLECTION, siteDoc.id));
    }
    for (const reqDoc of requestsSnapshot.docs) {
      batch.delete(doc(db, SITE_REQUESTS_COLLECTION, reqDoc.id));
    }
    batch.delete(doc(db, COLLECTION, projectId));

    await batch.commit();
  } catch (err) {
    console.error('[Firebase] Failed to cascade-delete project:', err);
    throw err;
  }
}

export function subscribeProjects(
  callback: (projects: Project[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    projectsRef(),
    (snapshot) => {
      const projects = snapshot.docs.map((d) => d.data() as Project);
      projects.sort((a, b) => a.createdAt - b.createdAt);
      callback(projects);
    },
    (err) => {
      console.error('[Firebase] Projects subscription error:', err);
      onError?.(err);
    },
  );
}