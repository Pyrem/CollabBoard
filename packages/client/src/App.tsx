import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './components/Auth/AuthProvider.js';
import { AuthGuard } from './components/Auth/AuthGuard.js';
import { LoginPage } from './components/Auth/LoginPage.js';
import { Dashboard } from './components/Dashboard/Dashboard.js';
import { BoardPage } from './components/Board/BoardPage.js';
import { BoardErrorBoundary } from './components/Board/BoardErrorBoundary.js';

/**
 * Root application component — sets up routing, auth, and error boundaries.
 *
 * Routes:
 * - `/login` → {@link LoginPage}
 * - `/dashboard` → {@link AuthGuard} → {@link Dashboard}
 * - `/board/:boardId` → {@link AuthGuard} → {@link BoardPage}
 * - `*` → redirect to `/dashboard`
 */
export function App(): React.JSX.Element {
  return (
    <BoardErrorBoundary message="The application encountered an unexpected error. Please reload the page.">
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/dashboard"
              element={
                <AuthGuard>
                  <Dashboard />
                </AuthGuard>
              }
            />
            <Route
              path="/board/:boardId"
              element={
                <AuthGuard>
                  <BoardErrorBoundary>
                    <BoardPage />
                  </BoardErrorBoundary>
                </AuthGuard>
              }
            />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </BoardErrorBoundary>
  );
}
