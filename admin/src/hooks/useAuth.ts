import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';
import type { AuthUser } from '../types';

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      const token = await firebaseUser.getIdTokenResult();
      const claims = token.claims as Record<string, unknown>;
      const role = (claims.role as string) === 'superadmin'
        ? 'superadmin'
        : claims.clubId
          ? 'clubadmin'
          : null;

      setUser({
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        role,
        clubId: (claims.clubId as string) ?? null,
      });
      setLoading(false);
    });
  }, []);

  return { user, loading };
}
