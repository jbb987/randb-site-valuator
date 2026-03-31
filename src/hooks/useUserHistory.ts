import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './useAuth';
import {
  subscribeUserHistory,
  logActivity as logActivityLib,
  clearUserHistory as clearHistoryLib,
} from '../lib/userHistory';
import type { UserActivityEntry, ToolId } from '../types';

export function useUserHistory(limit = 50) {
  const { user } = useAuth();
  const [history, setHistory] = useState<UserActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setHistory([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeUserHistory(
      user.uid,
      limit,
      (entries) => {
        setHistory(entries);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [user, limit]);

  const logActivity = useCallback(
    (
      toolId: ToolId,
      siteName: string,
      siteAddress: string,
      action: string,
      siteRegistryId?: string,
    ) => {
      if (!user) return;
      logActivityLib({
        userId: user.uid,
        toolId,
        siteName,
        siteAddress,
        action,
        createdAt: Date.now(),
        ...(siteRegistryId ? { siteRegistryId } : {}),
      });
    },
    [user],
  );

  const clearHistory = useCallback(() => {
    if (!user) return;
    clearHistoryLib(user.uid);
  }, [user]);

  return useMemo(
    () => ({ history, loading, logActivity, clearHistory }),
    [history, loading, logActivity, clearHistory],
  );
}
