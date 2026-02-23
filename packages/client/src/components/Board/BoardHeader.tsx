import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BoardMetadata, UserPresence } from '@collabboard/shared';
import { getBoard, updateBoardTitle } from '../../lib/api.js';

interface BoardHeaderProps {
  boardId: string;
  userId: string;
  onlineUsers: UserPresence[];
}

/**
 * Thin top bar (48px) with back navigation, editable board title, and online user count.
 *
 * - Fetches board metadata on mount to display the title.
 * - If the current user is the owner, clicking the title opens an inline input.
 * - Blur or Enter saves the new title via the REST API.
 * - Falls back to the boardId if the board isn't in the database yet.
 */
export function BoardHeader({ boardId, userId, onlineUsers }: BoardHeaderProps): React.JSX.Element {
  const navigate = useNavigate();

  const [boardMeta, setBoardMeta] = useState<BoardMetadata | null>(null);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const isOwner = boardMeta?.ownerId === userId;
  const displayTitle = boardMeta?.title ?? boardId;

  useEffect(() => {
    let cancelled = false;
    getBoard(boardId)
      .then((meta) => {
        if (!cancelled) setBoardMeta(meta);
      })
      .catch(() => {
        // Board not in database (e.g. legacy /board/default) — just show boardId
      });
    return () => { cancelled = true; };
  }, [boardId]);

  const startEditing = useCallback(() => {
    if (!isOwner) return;
    setEditValue(boardMeta?.title ?? '');
    setEditing(true);
    // Focus the input on next render
    setTimeout(() => inputRef.current?.select(), 0);
  }, [isOwner, boardMeta?.title]);

  const saveTitle = useCallback(async () => {
    const trimmed = editValue.trim();
    setEditing(false);
    if (!trimmed || trimmed === boardMeta?.title) return;
    try {
      const updated = await updateBoardTitle(boardId, trimmed);
      setBoardMeta(updated);
    } catch {
      // Silently fail — title stays as it was
    }
  }, [editValue, boardMeta?.title, boardId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        void saveTitle();
      } else if (e.key === 'Escape') {
        setEditing(false);
      }
    },
    [saveTitle],
  );

  return (
    <div className="h-12 bg-white border-b border-gray-200 flex items-center px-4 gap-4 z-[200] relative shrink-0">
      {/* Back to dashboard */}
      <button
        onClick={() => void navigate('/dashboard')}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 cursor-pointer bg-transparent border-none px-0"
      >
        <span className="text-base leading-none">&larr;</span>
        <span>Dashboard</span>
      </button>

      {/* Divider */}
      <div className="w-px h-5 bg-gray-200" />

      {/* Board title */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => void saveTitle()}
            onKeyDown={handleKeyDown}
            className="text-sm font-semibold bg-transparent border-none outline-none w-full px-1 py-0.5 rounded focus:ring-2 focus:ring-blue-300"
            maxLength={100}
          />
        ) : (
          <button
            onClick={startEditing}
            className={`text-sm font-semibold truncate bg-transparent border-none px-1 py-0.5 rounded max-w-full text-left ${
              isOwner ? 'cursor-pointer hover:bg-gray-100' : 'cursor-default'
            }`}
            title={isOwner ? 'Click to rename' : displayTitle}
          >
            {displayTitle}
          </button>
        )}
      </div>

      {/* Online users count */}
      <div className="flex items-center gap-1.5 text-sm text-gray-500 shrink-0">
        <div className="flex -space-x-1.5">
          {onlineUsers.slice(0, 5).map((u) => (
            <div
              key={u.userId}
              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-white"
              style={{ backgroundColor: u.color }}
              title={u.displayName}
            >
              {u.photoURL ? (
                <img src={u.photoURL} alt={u.displayName} className="w-full h-full rounded-full object-cover" />
              ) : (
                u.displayName.charAt(0).toUpperCase()
              )}
            </div>
          ))}
        </div>
        {onlineUsers.length > 5 && (
          <span className="text-xs text-gray-400">+{onlineUsers.length - 5}</span>
        )}
        <span className="text-xs text-gray-400">
          {onlineUsers.length === 1 ? '1 online' : `${String(onlineUsers.length)} online`}
        </span>
      </div>
    </div>
  );
}
