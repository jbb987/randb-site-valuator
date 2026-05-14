import { useEffect, useMemo, useState } from 'react';
import { subscribeDocumentsByCompany } from '../lib/documentRecords';
import type { DocumentRecord } from '../types';

/** Live list of every doc under a customer. UI filters by folderId/projectId
 *  in memory. Same single-subscription pattern as `useFoldersByCompany`. */
export function useDocumentsByCompany(
  companyId: string | undefined,
  options: { includeArchived?: boolean } = {},
) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) {
      setDocuments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeDocumentsByCompany(
      companyId,
      (list) => {
        setDocuments(list);
        setLoading(false);
      },
      options,
      () => setLoading(false),
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, options.includeArchived]);

  return useMemo(() => ({ documents, loading }), [documents, loading]);
}

/** Documents directly inside a folder. Derived from the per-customer
 *  subscription — no extra Firestore reads. */
export function useDocumentsInFolder(
  companyId: string | undefined,
  folderId: string | null,
  options: { includeArchived?: boolean } = {},
) {
  const { documents, loading } = useDocumentsByCompany(companyId, options);
  const filtered = useMemo(
    () => documents.filter((d) => d.folderId === folderId),
    [documents, folderId],
  );
  return { documents: filtered, loading };
}

/** Documents in any folder under a given ancestor folder (subtree view). */
export function useDocumentsUnderFolder(
  companyId: string | undefined,
  ancestorFolderId: string,
  options: { includeArchived?: boolean } = {},
) {
  const { documents, loading } = useDocumentsByCompany(companyId, options);
  const filtered = useMemo(
    () =>
      documents.filter(
        (d) =>
          d.folderId === ancestorFolderId || d.ancestorFolderIds.includes(ancestorFolderId),
      ),
    [documents, ancestorFolderId],
  );
  return { documents: filtered, loading };
}
