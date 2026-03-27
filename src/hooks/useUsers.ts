import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { db, createAuthUser, sendResetEmail } from '../lib/firebase';
import type { UserRole } from '../types';

export interface UserRecord {
  id: string;
  email: string;
  role: UserRole;
}

export function useUsers() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'users'), (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        email: d.data().email as string,
        role: d.data().role as UserRole,
      }));
      list.sort((a, b) => a.email.localeCompare(b.email));
      setUsers(list);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const updateRole = async (uid: string, newRole: UserRole) => {
    await updateDoc(doc(db, 'users', uid), { role: newRole });
  };

  const removeUser = async (uid: string) => {
    await deleteDoc(doc(db, 'users', uid));
  };

  const inviteUser = async (email: string, password: string, role: UserRole) => {
    const uid = await createAuthUser(email, password);
    await setDoc(doc(db, 'users', uid), { email, role });
    return uid;
  };

  const resetPassword = async (email: string) => {
    await sendResetEmail(email);
  };

  return { users, loading, updateRole, removeUser, inviteUser, resetPassword };
}
