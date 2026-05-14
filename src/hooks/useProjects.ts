import { useEffect, useMemo, useState } from 'react';
import { subscribeProject, subscribeProjectsByCompany } from '../lib/projects';
import type { Project, ProjectType } from '../types';

export function useProjectsByCompany(
  companyId: string | undefined,
  options: { includeArchived?: boolean } = {},
) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) {
      setProjects([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeProjectsByCompany(
      companyId,
      (list) => {
        setProjects(list);
        setLoading(false);
      },
      options,
      () => setLoading(false),
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, options.includeArchived]);

  return useMemo(() => ({ projects, loading }), [projects, loading]);
}

/** Same data as `useProjectsByCompany` but filtered to a single type. */
export function useProjectsByCompanyAndType(
  companyId: string | undefined,
  type: ProjectType,
  options: { includeArchived?: boolean } = {},
) {
  const { projects, loading } = useProjectsByCompany(companyId, options);
  const filtered = useMemo(() => projects.filter((p) => p.type === type), [projects, type]);
  return { projects: filtered, loading };
}

export function useProject(id: string | undefined) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setProject(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeProject(
      id,
      (p) => {
        setProject(p);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [id]);

  return { project, loading };
}
