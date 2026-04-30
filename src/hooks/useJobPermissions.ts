import { useMemo } from 'react';
import { useAuth } from './useAuth';
import type { ConstructionJob, ConstructionJobLevel } from '../types';

export interface JobPermissions {
  level: ConstructionJobLevel;
  canView: boolean;
  canEditBasicInfo: boolean;
  canManageTeam: boolean;
  canCreateTasks: boolean;
  canDeleteTasks: boolean;
  canUpdateTaskStatus: (taskAssigneeId?: string) => boolean;
  canUploadPhotos: boolean;
  canDeletePhoto: (photoUploadedBy?: string) => boolean;
  canUploadDocuments: boolean;
  canDeleteDocuments: boolean;
  canEditTimeline: boolean;
  canDeleteJob: boolean;
}

/** Compute the current user's level on a given job, plus a flat permission map.
 *  Level is derived from membership: admin (global role) > PM > worker > none. */
export function useJobPermissions(job: ConstructionJob | null | undefined): JobPermissions {
  const { user, role } = useAuth();

  return useMemo<JobPermissions>(() => {
    if (!user || !role || !job) {
      return {
        level: 'none',
        canView: false,
        canEditBasicInfo: false,
        canManageTeam: false,
        canCreateTasks: false,
        canDeleteTasks: false,
        canUpdateTaskStatus: () => false,
        canUploadPhotos: false,
        canDeletePhoto: () => false,
        canUploadDocuments: false,
        canDeleteDocuments: false,
        canEditTimeline: false,
        canDeleteJob: false,
      };
    }

    let level: ConstructionJobLevel = 'none';
    if (role === 'admin') level = 'admin';
    else if (job.projectManagerId === user.uid) level = 'pm';
    else if (job.workerIds.includes(user.uid)) level = 'worker';

    const isAdminOrPm = level === 'admin' || level === 'pm';
    const isWorker = level === 'worker';

    return {
      level,
      canView: level !== 'none',
      canEditBasicInfo: isAdminOrPm,
      canManageTeam: isAdminOrPm,
      canCreateTasks: isAdminOrPm,
      canDeleteTasks: isAdminOrPm,
      canUpdateTaskStatus: (taskAssigneeId) => {
        if (isAdminOrPm) return true;
        if (isWorker) return taskAssigneeId === user.uid;
        return false;
      },
      canUploadPhotos: level !== 'none',
      canDeletePhoto: (photoUploadedBy) => {
        if (isAdminOrPm) return true;
        if (isWorker) return photoUploadedBy === user.uid;
        return false;
      },
      canUploadDocuments: isAdminOrPm,
      canDeleteDocuments: isAdminOrPm,
      canEditTimeline: isAdminOrPm,
      canDeleteJob: isAdminOrPm,
    };
  }, [user, role, job]);
}
