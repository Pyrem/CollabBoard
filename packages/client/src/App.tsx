import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './components/Auth/AuthProvider.js';
import { AuthGuard } from './components/Auth/AuthGuard.js';
import { LoginPage } from './components/Auth/LoginPage.js';
import { BoardPage } from './components/Board/BoardPage.js';
import { BoardErrorBoundary } from './components/Board/BoardErrorBoundary.js';

/**
 * Root application component — sets up routing, auth, and error boundaries.
 *
 * Component tree (outside → in):
 * 1. **Top-level {@link BoardErrorBoundary}** — catches fatal errors anywhere
 *    in the app and shows a recovery UI.
 * 2. **{@link BrowserRouter}** — client-side routing.
 * 3. **{@link AuthProvider}** — makes Firebase auth state available via context.
 * 4. **Routes**:
 *    - `/login` → {@link LoginPage}
 *    - `/board/:boardId` → {@link AuthGuard} → inner {@link BoardErrorBoundary} → {@link BoardPage}
 *    - `*` → redirect to `/board/default`
 */
export function App(): React.JSX.Element {
  return (
    <BoardErrorBoundary message="The application encountered an unexpected error. Please reload the page.">
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
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
            <Route path="*" element={<Navigate to="/board/default" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </BoardErrorBoundary>
  );
}
