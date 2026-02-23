import { use, useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { AuthContext } from '../../hooks/useAuth.js';
import { useYjs } from '../../hooks/useYjs.js';
import { useBoard } from '../../hooks/useBoard.js';
import { useCursors } from '../../hooks/useCursors.js';
import { usePresence } from '../../hooks/usePresence.js';
import { useAI } from '../../hooks/useAI.js';
import { Canvas, type SelectedObject, type SceneCenter, type ViewportState } from './Canvas.js';
import { Toolbar } from '../Toolbar/Toolbar.js';
import { CursorOverlay } from '../Cursors/CursorOverlay.js';
import { AIChat } from '../AIAgent/AIChat.js';
import { BoardHeader } from './BoardHeader.js';

/**
 * Main board page — the top-level orchestrator for a single board session.
 *
 * Composes every major subsystem:
 *
 * | Subsystem         | Hook / Component                   |
 * |-------------------|------------------------------------|
 * | Real-time sync    | {@link useYjs} → `objectsMap`      |
 * | Object CRUD       | {@link useBoard}                   |
 * | Cursor broadcast  | {@link useCursors}                 |
 * | Presence panel    | {@link usePresence}                |
 * | AI commands       | {@link useAI}                      |
 * | Canvas rendering  | {@link Canvas}                     |
 * | Tool selection    | {@link Toolbar}                    |
 * | Remote cursors    | {@link CursorOverlay}              |
 *
 * Reads `boardId` from the React Router params (`:boardId`). Displays a
 * "Connecting..." screen until the Yjs provider is ready, and a
 * "Reconnecting..." banner if the WebSocket drops.
 */
export function BoardPage(): React.JSX.Element {
  const { boardId = 'default' } = useParams<{ boardId: string }>();
  const location = useLocation();
  const { user } = use(AuthContext);
  // user is guaranteed non-null by AuthGuard
  const yjs = useYjs(boardId, user!);

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
  const ai = useAI();

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

  const handleAISend = useCallback((command: string) => {
    const center = getSceneCenterRef.current?.();
    void ai.sendCommand(command, boardId, center ?? undefined);
  }, [ai, boardId]);

  const templateFiredRef = useRef(false);
  useEffect(() => {
    if (templateFiredRef.current || !yjs?.connected) return;
    const state = location.state as { template?: string } | null;
    if (!state?.template) return;

    const TEMPLATE_PROMPTS: Record<string, string> = {
      swot: 'Make me a SWOT Analysis',
    };

    const prompt = TEMPLATE_PROMPTS[state.template];
    if (!prompt) return;
    templateFiredRef.current = true;

    setTimeout(() => {
      const center = getSceneCenterRef.current?.();
      void ai.sendCommand(prompt, boardId, center ?? undefined);
    }, 500);
  }, [yjs?.connected, location.state, ai, boardId]);

  if (!yjs) {
    return (
      <div className="flex items-center justify-center h-screen bg-warm-100 text-warm-600">
        Connecting...
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-screen">
      <BoardHeader boardId={boardId} userId={userId} onlineUsers={onlineUsers} />
      {!yjs.connected && (
        <div className="bg-orange-500 text-white text-center p-1.5 text-xs font-semibold z-[1000] shrink-0">
          Reconnecting...
        </div>
      )}
      <div className="relative flex-1 min-h-0">
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
        <AIChat messages={ai.messages} isLoading={ai.isLoading} onSend={handleAISend} />
      </div>
    </div>
  );
}
