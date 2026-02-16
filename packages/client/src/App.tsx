import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './components/Auth/AuthProvider.js';
import { AuthGuard } from './components/Auth/AuthGuard.js';
import { LoginPage } from './components/Auth/LoginPage.js';
import { BoardPage } from './components/Board/BoardPage.js';

export function App(): React.JSX.Element {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/board/:boardId"
            element={
              <AuthGuard>
                <BoardPage />
              </AuthGuard>
            }
          />
          <Route path="*" element={<Navigate to="/board/default" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
