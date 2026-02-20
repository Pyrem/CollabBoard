import { useState, useEffect, useCallback, createContext } from 'react';
import { auth, onAuthStateChanged, type User } from '../lib/firebase.js';

export interface AuthState {
  user: User | null;
  loading: boolean;
}

/** React context carrying the current Firebase auth state. */
export const AuthContext = createContext<AuthState>({ user: null, loading: true });

/**
 * Subscribe to Firebase Auth state changes.
 *
 * Listens via `onAuthStateChanged` and exposes the current `User` (or `null`)
 * along with a `loading` flag that is `true` until the first callback fires.
 *
 * @returns `{ user, loading }` — `user` is `null` when signed out or while
 *   the initial auth check is in progress.
 *
 * @remarks
 * Side-effect: registers a Firebase observer on mount, unsubscribes on unmount.
 */
export function useAuthState(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return { user, loading };
}