import type { UserPresence } from '@collabboard/shared';

/** Props for the {@link PresencePanel} component. */
interface PresencePanelProps {
  /** All currently online users from {@link usePresence}. */
  users: UserPresence[];
}

/**
 * Floating panel (top-right corner) showing the list of currently online users.
 *
 * Each user is rendered with a coloured avatar circle (photo or first-initial
 * fallback) and their display name. The panel header shows the total count.
 * Scrollable when more than ~6 users are connected.
 *
 * @see {@link usePresence} for how the `users` array is derived from Yjs awareness.
 */
export function PresencePanel({ users }: PresencePanelProps): React.JSX.Element {
  return (
    <div className="absolute top-3 right-3 bg-warm-50 rounded-[10px] shadow-md min-w-[180px] z-[100] overflow-hidden border border-warm-200">
      <div className="px-3.5 py-2.5 text-[13px] font-semibold border-b border-warm-200 text-warm-700">
        Online ({users.length})
      </div>
      <div className="py-1.5 max-h-[200px] overflow-y-auto">
        {users.map((user) => (
          <div key={user.userId} className="flex items-center gap-2.5 px-3.5 py-1.5">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center overflow-hidden shrink-0"
              style={{ backgroundColor: user.color }}
            >
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-white text-xs font-bold">
                  {user.displayName.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <span className="text-[13px] text-warm-700">{user.displayName}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
