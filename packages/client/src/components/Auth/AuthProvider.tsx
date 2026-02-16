import type { ReactNode } from 'react';
import { AuthContext, useAuthState } from '../../hooks/useAuth.js';

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps): React.JSX.Element {
  const authState = useAuthState();

  return <AuthContext value={authState}>{children}</AuthContext>;
}
