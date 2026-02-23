import { use, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BoardMetadata } from '@collabboard/shared';
import { AuthContext } from '../../hooks/useAuth.js';
import { logOut } from '../../lib/firebase.js';
import { listBoards, createBoard, deleteBoard, fetchThumbnail } from '../../lib/api.js';

/** Thumbnail preview that fetches the image via the authenticated API. */
function BoardThumbnail({ boardId }: { boardId: string }): React.JSX.Element {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let revoked = false;
    void fetchThumbnail(boardId).then((url) => {
      if (!revoked && url) setSrc(url);
    });
    return () => {
      revoked = true;
      if (src) URL.revokeObjectURL(src);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  if (!src) {
    return (
      <div className="w-full h-[135px] bg-warm-200 rounded-t-xl flex items-center justify-center">
        <span className="text-warm-400 text-xs">No preview</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt="Board preview"
      className="w-full h-[135px] object-cover rounded-t-xl"
    />
  );
}

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
    <div className="min-h-screen bg-warm-100">
      {/* Header */}
      <header className="bg-warm-50 shadow-sm border-b border-warm-200">
        <div className="px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-warm-800">CollabBoard</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-warm-500">{user?.displayName ?? user?.email}</span>
            <button
              onClick={() => void handleLogout()}
              className="px-3 py-1.5 text-[13px] font-semibold border border-warm-300 rounded-lg bg-white text-warm-700 cursor-pointer hover:bg-warm-100"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-warm-800">My Boards</h2>
          <button
            onClick={() => void handleCreate()}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-amber-accent text-white cursor-pointer hover:bg-amber-hover border-none"
          >
            + New Board
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>
        )}

        {loading ? (
          <p className="text-warm-500 text-sm">Loading boards...</p>
        ) : boards.length === 0 ? (
          <div className="text-center py-16 text-warm-400">
            <p className="text-lg mb-2">No boards yet</p>
            <p className="text-sm">Click "+ New Board" to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {boards.map((board) => (
              <div
                key={board.id}
                className="bg-warm-50 rounded-xl shadow-sm border border-warm-200 cursor-pointer hover:shadow-md transition-shadow relative group overflow-hidden"
                onClick={() => void navigate(`/board/${board.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void navigate(`/board/${board.id}`);
                }}
              >
                {board.hasThumbnail ? (
                  <BoardThumbnail boardId={board.id} />
                ) : (
                  <div className="w-full h-[135px] bg-warm-200 rounded-t-xl flex items-center justify-center">
                    <span className="text-warm-400 text-xs">No preview</span>
                  </div>
                )}
                <div className="p-4">
                  <h3 className="font-semibold text-[15px] mb-1 pr-8 text-warm-800">{board.title}</h3>
                  <p className="text-xs text-warm-400">
                    {new Date(board.updatedAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDelete(board.id);
                  }}
                  className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded text-warm-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity border-none bg-transparent cursor-pointer text-base"
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
