import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { generateId, isValidId } from '@collabboard/shared';
import { AuthContext, type AuthState } from './hooks/useAuth';
import { AuthGuard } from './components/Auth/AuthGuard';

// Minimal stub components — we only care about routing, not subsystem rendering
function DashboardStub(): React.JSX.Element {
  return <div data-testid="dashboard">Dashboard</div>;
}

function BoardStub(): React.JSX.Element {
  const { boardId } = useParams<{ boardId: string }>();
  return <div data-testid="board-page" data-board-id={boardId}>Board: {boardId}</div>;
}

function LoginStub(): React.JSX.Element {
  return <div data-testid="login-page">Login</div>;
}

/** Render the app shell with a given auth state and initial route. */
function renderApp(authState: AuthState, initialRoute: string): ReturnType<typeof render> {
  return render(
    <AuthContext value={authState}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="/login" element={<LoginStub />} />
          <Route
            path="/dashboard"
            element={
              <AuthGuard>
                <DashboardStub />
              </AuthGuard>
            }
          />
          <Route
            path="/board/:boardId"
            element={
              <AuthGuard>
                <BoardStub />
              </AuthGuard>
            }
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </MemoryRouter>
    </AuthContext>,
  );
}

const LOGGED_IN: AuthState = {
  user: { uid: 'test-user-123', displayName: 'Test User', email: 'test@example.com' } as AuthState['user'],
  loading: false,
};

const LOGGED_OUT: AuthState = { user: null, loading: false };
const LOADING: AuthState = { user: null, loading: true };

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Routing with generated board IDs', () => {
  describe('generateId produces valid route-safe IDs', () => {
    it('generated IDs are valid UUIDs usable in /board/:boardId URLs', () => {
      const id = generateId();
      expect(isValidId(id)).toBe(true);
      // Should not contain characters that break URL paths
      expect(id).not.toMatch(/[/?#&=%]/);
    });

    it('generated IDs are unique across calls', () => {
      const a = generateId();
      const b = generateId();
      expect(a).not.toBe(b);
      expect(isValidId(a)).toBe(true);
      expect(isValidId(b)).toBe(true);
    });
  });

  describe('authenticated user navigation', () => {
    it('navigating to /dashboard renders the dashboard', () => {
      renderApp(LOGGED_IN, '/dashboard');
      expect(screen.getByTestId('dashboard')).toBeDefined();
    });

    it('navigating to /board/:boardId with a generated ID renders the board', () => {
      const boardId = generateId();
      renderApp(LOGGED_IN, `/board/${boardId}`);
      const boardPage = screen.getByTestId('board-page');
      expect(boardPage).toBeDefined();
      expect(boardPage.getAttribute('data-board-id')).toBe(boardId);
    });

    it('multiple generated board IDs all route correctly', () => {
      const ids = Array.from({ length: 5 }, () => generateId());
      for (const id of ids) {
        const { unmount } = renderApp(LOGGED_IN, `/board/${id}`);
        const boardPage = screen.getByTestId('board-page');
        expect(boardPage.getAttribute('data-board-id')).toBe(id);
        expect(isValidId(boardPage.getAttribute('data-board-id')!)).toBe(true);
        unmount();
      }
    });

    it('unknown routes redirect to /dashboard', () => {
      renderApp(LOGGED_IN, '/nonexistent');
      expect(screen.getByTestId('dashboard')).toBeDefined();
    });

    it('root route redirects to /dashboard', () => {
      renderApp(LOGGED_IN, '/');
      expect(screen.getByTestId('dashboard')).toBeDefined();
    });
  });

  describe('unauthenticated user navigation', () => {
    it('/dashboard redirects to /login', () => {
      renderApp(LOGGED_OUT, '/dashboard');
      expect(screen.getByTestId('login-page')).toBeDefined();
      expect(screen.queryByTestId('dashboard')).toBeNull();
    });

    it('/board/:boardId redirects to /login', () => {
      const boardId = generateId();
      renderApp(LOGGED_OUT, `/board/${boardId}`);
      expect(screen.getByTestId('login-page')).toBeDefined();
      expect(screen.queryByTestId('board-page')).toBeNull();
    });
  });

  describe('loading auth state', () => {
    it('shows loading indicator while auth is resolving', () => {
      renderApp(LOADING, '/dashboard');
      expect(screen.getByText('Loading...')).toBeDefined();
      expect(screen.queryByTestId('dashboard')).toBeNull();
      expect(screen.queryByTestId('login-page')).toBeNull();
    });
  });
});
