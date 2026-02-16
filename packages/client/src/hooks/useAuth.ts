import { useState, useEffect, useCallback, createContext } from 'react';
import { auth, onAuthStateChanged, type User } from '../lib/firebase.js';

export interface AuthState {
  user: User | null;
  loading: boolean;
}

export const AuthContext = createContext<AuthState>({ user: null, loading: true });

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

export function useRequireAuth(): { user: User; loading: boolean } | { user: null; loading: boolean } {
  const { user, loading } = useAuthState();
  return { user, loading };
}
