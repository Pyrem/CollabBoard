import { use, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../../hooks/useAuth.js';

interface AuthGuardProps {
  children: ReactNode;
}

/**
 * Route guard that redirects to `/login` if the user is not authenticated.
 *
 * Shows a full-screen "Loading..." indicator while the Firebase auth state
 * is being resolved (first render after page refresh). Once resolved, renders
 * `children` if the user is signed in, or a `<Navigate to="/login">` redirect
 * otherwise.
 *
 * @example
 * <Route path="/board/:boardId" element={<AuthGuard><BoardPage /></AuthGuard>} />
 *
 * @see {@link AuthContext} for the React context consumed by this component.
 */
export function AuthGuard({ children }: AuthGuardProps): React.JSX.Element {
  const { user, loading } = use(AuthContext);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        Loading...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
