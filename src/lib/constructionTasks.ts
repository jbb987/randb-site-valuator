import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import type { JobTask, JobTaskStatus } from '../types';

/** Tasks live as a sub-collection on each job: construction-jobs/{jobId}/tasks. */
function tasksRef(jobId: string) {
  return collection(db, 'construction-jobs', jobId, 'tasks');
}

export async function createJobTask(
  jobId: string,
  entry: Omit<JobTask, 'id' | 'jobId' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  const id = doc(tasksRef(jobId)).id;
  const now = Date.now();
  const full: JobTask = {
    ...entry,
    id,
    jobId,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(doc(tasksRef(jobId), id), full);
  return id;
}

/** Update a task. When `status` changes to 'done', completedAt is stamped;
 *  when it changes away from 'done', completedAt is cleared. */
export async function updateJobTask(
  jobId: string,
  taskId: string,
  updates: Partial<JobTask>,
): Promise<void> {
  const patch: Partial<JobTask> = { ...updates, updatedAt: Date.now() };
  if (updates.status !== undefined) {
    if (updates.status === 'done') patch.completedAt = Date.now();
    else patch.completedAt = undefined;
  }
  await updateDoc(doc(tasksRef(jobId), taskId), patch as Record<string, unknown>);
}

export async function deleteJobTask(jobId: string, taskId: string): Promise<void> {
  await deleteDoc(doc(tasksRef(jobId), taskId));
}

/** Subscribe to all tasks for a job, ordered by creation time. */
export function subscribeJobTasks(
  jobId: string,
  callback: (tasks: JobTask[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(tasksRef(jobId), orderBy('createdAt', 'asc'));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => d.data() as JobTask)),
    (err) => {
      console.error('[Firebase] Job tasks subscription error:', err);
      onError?.(err);
    },
  );
}

export const TASK_STATUS_ORDER: Record<JobTaskStatus, number> = {
  'in-progress': 0,
  'todo': 1,
  'done': 2,
};
