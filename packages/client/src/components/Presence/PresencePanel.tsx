import type { UserPresence } from '@collabboard/shared';

interface PresencePanelProps {
  users: UserPresence[];
}

export function PresencePanel({ users }: PresencePanelProps): React.JSX.Element {
  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        Online ({users.length})
      </div>
      <div style={styles.list}>
        {users.map((user) => (
          <div key={user.userId} style={styles.user}>
            <div
              style={{
                ...styles.avatar,
                backgroundColor: user.color,
              }}
            >
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName}
                  style={styles.avatarImg}
                />
              ) : (
                <span style={styles.avatarText}>
                  {user.displayName.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <span style={styles.userName}>{user.displayName}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#fff',
    borderRadius: 10,
    boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
    minWidth: 180,
    zIndex: 100,
    overflow: 'hidden',
  },
  header: {
    padding: '10px 14px',
    fontSize: 13,
    fontWeight: 600,
    borderBottom: '1px solid #eee',
  },
  list: {
    padding: '6px 0',
    maxHeight: 200,
    overflowY: 'auto',
  },
  user: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '6px 14px',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  avatarText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
  },
  userName: {
    fontSize: 13,
    color: '#333',
  },
};
