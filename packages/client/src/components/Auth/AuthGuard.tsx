import { use, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../../hooks/useAuth.js';

interface AuthGuardProps {
  children: ReactNode;
}

/** Route guard that redirects to `/login` if the user is not authenticated. */
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
