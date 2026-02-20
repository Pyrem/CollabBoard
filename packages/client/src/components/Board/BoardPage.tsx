import { use, useCallback, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../hooks/useAuth.js';
import { logOut } from '../../lib/firebase.js';
import { useYjs } from '../../hooks/useYjs.js';
import { useBoard } from '../../hooks/useBoard.js';
import { useCursors } from '../../hooks/useCursors.js';
import { usePresence } from '../../hooks/usePresence.js';
import { Canvas, type SelectedObject, type SceneCenter, type ViewportState } from './Canvas.js';
import { Toolbar } from '../Toolbar/Toolbar.js';
import { CursorOverlay } from '../Cursors/CursorOverlay.js';
import { PresencePanel } from '../Presence/PresencePanel.js';

export function BoardPage(): React.JSX.Element {
  const { boardId = 'default' } = useParams<{ boardId: string }>();
  const { user } = use(AuthContext);
  const navigate = useNavigate();
  const yjs = useYjs(boardId);

  const handleLogout = useCallback(async () => {
    await logOut();
    void navigate('/', { replace: true });
  }, [navigate]);

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
  const [viewport, setViewport] = useState<ViewportState>({ zoom: 1, panX: 0, panY: 0 });
  const [activeTool, setActiveTool] = useState<string>('select');
  const getSceneCenterRef = useRef<(() => SceneCenter) | null>(null);

  const handleSelectionChange = useCallback((selected: SelectedObject | null) => {
    setSelectedObject(selected);
  }, []);

  const handleCanvasReady = useCallback((getSceneCenter: () => SceneCenter) => {
    getSceneCenterRef.current = getSceneCenter;
  }, []);

  const handleViewportChange = useCallback((vp: ViewportState) => {
    setViewport(vp);
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
        userCount={onlineUsers.length}
        activeTool={activeTool}
        onToolChange={setActiveTool}
        onCursorMove={updateLocalCursor}
        onSelectionChange={handleSelectionChange}
        onReady={handleCanvasReady}
        onViewportChange={handleViewportChange}
      />
      <CursorOverlay cursors={remoteCursors} viewport={viewport} />
      <Toolbar board={board} selectedObject={selectedObject} activeTool={activeTool} onToolChange={setActiveTool} getSceneCenter={() => getSceneCenterRef.current?.() ?? { x: 0, y: 0 }} />
      <PresencePanel users={onlineUsers} />
      <button onClick={() => void handleLogout()} style={styles.logoutBtn}>
        Log out
      </button>
      {!yjs.connected && (
        <div style={styles.connectionBanner}>Reconnecting...</div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  logoutBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: '6px 14px',
    fontSize: 13,
    fontWeight: 600,
    border: '1px solid #ddd',
    borderRadius: 8,
    backgroundColor: '#fff',
    color: '#333',
    cursor: 'pointer',
    zIndex: 100,
  },
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
