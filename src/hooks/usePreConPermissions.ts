import { useMemo } from 'react';
import { useAuth } from './useAuth';
import type { PreConSite } from '../types';

export interface PreConPermissions {
  /** Edit the merged Site Status card (engineer assignment + MW + grade). */
  canEditStatus: boolean;
  /** Pick utility + advance LOA timeline. */
  canManageLoa: boolean;
  /** Edit site basics (name / utility-platform URL) and archive. */
  canManageSite: boolean;
}

/** Per-site permissions for the Pre-Construction tool.
 *
 *  - admin   → everything
 *  - manager → edit status + manage LOA + archive
 *  - labor   → read-only, EXCEPT the assigned engineer can edit status (MW +
 *              grade) on the site they were assigned to
 *
 *  Tool-level view access is handled by the route guard, so no `canView` flag
 *  here.
 */
export function usePreConPermissions(site: PreConSite | null | undefined): PreConPermissions {
  const { user, role } = useAuth();

  return useMemo<PreConPermissions>(() => {
    if (!user || !role) {
      return { canEditStatus: false, canManageLoa: false, canManageSite: false };
    }

    const isAdmin = role === 'admin';
    const isManager = role === 'manager';
    const isAssignedEngineer = !!site?.engineerReviewerId && site.engineerReviewerId === user.uid;

    return {
      canEditStatus: isAdmin || isManager || isAssignedEngineer,
      canManageLoa: isAdmin || isManager,
      canManageSite: isAdmin || isManager,
    };
  }, [user, role, site]);
}
