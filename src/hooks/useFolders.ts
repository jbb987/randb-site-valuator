import { useEffect, useMemo, useState } from 'react';
import {
  subscribeFolder,
  subscribeFoldersByCompany,
} from '../lib/folders';
import type { Folder } from '../types';

/** Live list of every folder under a customer. UI filters by parentFolderId
 *  or projectId in memory — keeping a single subscription open beats one per
 *  visible folder. */
export function useFoldersByCompany(
  companyId: string | undefined,
  options: { includeArchived?: boolean } = {},
) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) {
      setFolders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeFoldersByCompany(
      companyId,
      (list) => {
        setFolders(list);
        setLoading(false);
      },
      options,
      () => setLoading(false),
    );
    return unsub;
    // The options object is recreated on every render but its content rarely
    // changes; reading the flag directly keeps the deps array stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, options.includeArchived]);

  return useMemo(() => ({ folders, loading }), [folders, loading]);
}

/** Children of a folder (or root-level folders when parentFolderId === null).
 *  Derived from the full-customer subscription — no extra Firestore read. */
export function useFolderChildren(
  companyId: string | undefined,
  parentFolderId: string | null,
  options: { includeArchived?: boolean } = {},
) {
  const { folders, loading } = useFoldersByCompany(companyId, options);
  const children = useMemo(
    () =>
      folders
        .filter((f) => f.parentFolderId === parentFolderId)
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    [folders, parentFolderId],
  );
  return { children, loading };
}

export function useFolder(id: string | undefined) {
  const [folder, setFolder] = useState<Folder | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setFolder(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeFolder(
      id,
      (f) => {
        setFolder(f);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [id]);

  return { folder, loading };
}
