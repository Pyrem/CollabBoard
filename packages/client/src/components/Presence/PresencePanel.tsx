import type { UserPresence } from '@collabboard/shared';

interface PresencePanelProps {
  users: UserPresence[];
}

export function PresencePanel({ users }: PresencePanelProps): React.JSX.Element {
  return (
    <div className="absolute top-3 right-3 bg-white rounded-[10px] shadow-md min-w-[180px] z-[100] overflow-hidden">
      <div className="px-3.5 py-2.5 text-[13px] font-semibold border-b border-gray-200">
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
            <span className="text-[13px] text-gray-700">{user.displayName}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
