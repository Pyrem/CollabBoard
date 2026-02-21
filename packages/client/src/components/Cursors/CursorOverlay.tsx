import type { UserPresence } from '@collabboard/shared';
import type { ViewportState } from '../Board/Canvas.js';

interface CursorOverlayProps {
  cursors: UserPresence[];
  viewport: ViewportState;
}

export function CursorOverlay({ cursors, viewport }: CursorOverlayProps): React.JSX.Element {
  return (
    <div style={styles.overlay}>
      {cursors.map((user) => {
        if (!user.cursor) return null;
        const screenX = user.cursor.x * viewport.zoom + viewport.panX;
        const screenY = user.cursor.y * viewport.zoom + viewport.panY;
        return (
          <div
            key={user.userId}
            style={{
              ...styles.cursor,
              left: screenX,
              top: screenY,
            }}
          >
            <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
              <path
                d="M0 0L16 12H6L0 20V0Z"
                fill={user.color}
              />
            </svg>
            <span
              style={{
                ...styles.label,
                backgroundColor: user.color,
              }}
            >
              {user.displayName}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: 50,
  },
  cursor: {
    position: 'absolute',
    pointerEvents: 'none',
    transition: 'left 0.05s linear, top 0.05s linear',
  },
  label: {
    position: 'absolute',
    top: 20,
    left: 10,
    color: '#fff',
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 6px',
    borderRadius: 4,
    whiteSpace: 'nowrap',
  },
};
