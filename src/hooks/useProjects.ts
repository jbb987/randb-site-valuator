import { useState, useCallback, useEffect, useMemo } from 'react';
import type { Project, UserRole } from '../types';
import {
  saveProject,
  deleteProjectCascade,
  renameProjectInDB,
  subscribeProjects,
  updateProjectMembers,
} from '../lib/projects';

const ACTIVE_KEY = 'rbpower-active-project';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function useProjects(uid?: string, role?: UserRole | null) {
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Agents only see projects they're a member of; admins see everything
  const projects = useMemo(() => {
    if (!role || role === 'admin' || !uid) return allProjects;
    return allProjects.filter((p) => p.memberIds?.includes(uid));
  }, [allProjects, role, uid]);

  useEffect(() => {
    const unsub = subscribeProjects(
      (remoteProjects) => {
        // Ensure memberIds always exists (backcompat for old docs)
        const normalized = remoteProjects.map((p) => ({
          ...p,
          memberIds: p.memberIds ?? [],
        }));
        setAllProjects(normalized);
        setLoading(false);
      },
      () => setLoading(false),
    );

    return () => unsub();
  }, []);

  // Re-validate activeProjectId when the visible project list changes
  useEffect(() => {
    setActiveProjectId((prev) => {
      if (prev && projects.some((p) => p.id === prev)) return prev;
      try {
        const stored = localStorage.getItem(ACTIVE_KEY);
        if (stored && projects.some((p) => p.id === stored)) return stored;
      } catch { /* ignore */ }
      return projects[0]?.id ?? '';
    });
  }, [projects]);

  useEffect(() => {
    if (activeProjectId) {
      localStorage.setItem(ACTIVE_KEY, activeProjectId);
    }
  }, [activeProjectId]);

  const createProject = useCallback((name: string, memberIds: string[] = []) => {
    const id = generateId();
    const project: Project = {
      id,
      name,
      memberIds,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    saveProject(project);
    setActiveProjectId(id);
    return id;
  }, []);

  const deleteProject = useCallback(async (id: string) => {
    setActiveProjectId((prev) => {
      if (prev === id) return projects[0]?.id !== id ? projects[0]?.id ?? '' : projects[1]?.id ?? '';
      return prev;
    });
    await deleteProjectCascade(id);
  }, [projects]);

  const renameProject = useCallback((id: string, name: string) => {
    renameProjectInDB(id, name);
  }, []);

  const selectProject = useCallback((id: string) => {
    setActiveProjectId(id);
  }, []);

  const updateMembers = useCallback((projectId: string, memberIds: string[]) => {
    updateProjectMembers(projectId, memberIds);
  }, []);

  return {
    projects,
    activeProjectId,
    loading,
    createProject,
    deleteProject,
    renameProject,
    selectProject,
    updateMembers,
  };
}
