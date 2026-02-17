import { use, useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AuthContext } from '../../hooks/useAuth.js';
import { useYjs } from '../../hooks/useYjs.js';
import { useBoard } from '../../hooks/useBoard.js';
import { useCursors } from '../../hooks/useCursors.js';
import { usePresence } from '../../hooks/usePresence.js';
import { Canvas, type SelectedObject } from './Canvas.js';
import { Toolbar } from '../Toolbar/Toolbar.js';
import { CursorOverlay } from '../Cursors/CursorOverlay.js';
import { PresencePanel } from '../Presence/PresencePanel.js';

export function BoardPage(): React.JSX.Element {
  const { boardId = 'default' } = useParams<{ boardId: string }>();
  const { user } = use(AuthContext);
  const yjs = useYjs(boardId);

  const userId = user?.uid ?? 'anonymous';
  const displayName = user?.displayName ?? 'Anonymous';
  const photoURL = user?.photoURL ?? null;

  const board = useBoard(yjs?.objectsMap ?? null, userId);
  const { remoteCursors, updateLocalCursor } = useCursors(
    yjs?.provider ?? null,
    userId,
    displayName,
    photoURL,
  );
  const onlineUsers = usePresence(yjs?.provider ?? null);

  const [selectedObject, setSelectedObject] = useState<SelectedObject | null>(null);

  const handleSelectionChange = useCallback((selected: SelectedObject | null) => {
    setSelectedObject(selected);
  }, []);

  if (!yjs) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        Connecting...
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas
        objectsMap={yjs.objectsMap}
        board={board}
        onCursorMove={updateLocalCursor}
        onSelectionChange={handleSelectionChange}
      />
      <CursorOverlay cursors={remoteCursors} />
      <Toolbar board={board} selectedObject={selectedObject} />
      <PresencePanel users={onlineUsers} />
      {!yjs.connected && (
        <div style={styles.connectionBanner}>Reconnecting...</div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  connectionBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#ff9800',
    color: '#fff',
    textAlign: 'center',
    padding: 8,
    fontSize: 14,
    fontWeight: 600,
    zIndex: 1000,
  },
};
