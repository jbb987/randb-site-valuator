import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';
import { computeQuota, type QuotaSnapshot } from '../lib/userQuotas';
import type { MonthlyUsage } from '../types';

const ADMIN_SNAPSHOT: QuotaSnapshot = {
  isAdmin: true,
  limit: Infinity,
  used: 0,
  remaining: Infinity,
};

export function useUserQuota() {
  const { user, role } = useAuth();
  const [snapshot, setSnapshot] = useState<QuotaSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !role) {
      setSnapshot(null);
      setLoading(false);
      return;
    }
    if (role === 'admin') {
      setSnapshot(ADMIN_SNAPSHOT);
      setLoading(false);
      return;
    }
    const ref = doc(db, 'users', user.uid);
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.data();
      setSnapshot(
        computeQuota(
          role,
          data?.monthlyQuotaLimit as number | undefined,
          data?.monthlyUsage as MonthlyUsage | undefined,
        ),
      );
      setLoading(false);
    });
    return unsub;
  }, [user, role]);

  return { quota: snapshot, loading };
}
