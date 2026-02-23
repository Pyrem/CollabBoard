import { use, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BoardMetadata } from '@collabboard/shared';
import { AuthContext } from '../../hooks/useAuth.js';
import { logOut } from '../../lib/firebase.js';
import { listBoards, createBoard, deleteBoard } from '../../lib/api.js';

/**
 * Dashboard page — lists the user's boards and lets them create or delete boards.
 *
 * After login the user lands here. Each board card navigates to `/board/:id`.
 */
export function Dashboard(): React.JSX.Element {
  const { user } = use(AuthContext);
  const navigate = useNavigate();

  const [boards, setBoards] = useState<BoardMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBoards = useCallback(async () => {
    try {
      setError(null);
      const data = await listBoards();
      setBoards(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load boards');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBoards();
  }, [fetchBoards]);

  const handleCreate = useCallback(async () => {
    try {
      const board = await createBoard();
      void navigate(`/board/${board.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create board');
    }
  }, [navigate]);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteBoard(id);
        setBoards((prev) => prev.filter((b) => b.id !== id));
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to delete board');
      }
    },
    [],
  );

  const handleLogout = useCallback(async () => {
    await logOut();
    void navigate('/login', { replace: true });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">CollabBoard</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{user?.displayName ?? user?.email}</span>
            <button
              onClick={() => void handleLogout()}
              className="px-3 py-1.5 text-[13px] font-semibold border border-gray-300 rounded-lg bg-white text-gray-700 cursor-pointer hover:bg-gray-50"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">My Boards</h2>
          <button
            onClick={() => void handleCreate()}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-500 text-white cursor-pointer hover:bg-blue-600 border-none"
          >
            + New Board
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>
        )}

        {loading ? (
          <p className="text-gray-500 text-sm">Loading boards...</p>
        ) : boards.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg mb-2">No boards yet</p>
            <p className="text-sm">Click "+ New Board" to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {boards.map((board) => (
              <div
                key={board.id}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 cursor-pointer hover:shadow-md transition-shadow relative group"
                onClick={() => void navigate(`/board/${board.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void navigate(`/board/${board.id}`);
                }}
              >
                <h3 className="font-semibold text-[15px] mb-1 pr-8">{board.title}</h3>
                <p className="text-xs text-gray-400">
                  {new Date(board.updatedAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDelete(board.id);
                  }}
                  className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity border-none bg-transparent cursor-pointer text-base"
                  aria-label="Delete board"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
