import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Canvas as FabricCanvas,
  Rect,
  Textbox,
  Group,
  type TPointerEvent,
  type TPointerEventInfo,
} from 'fabric';
import type * as Y from 'yjs';
import type { BoardObject } from '@collabboard/shared';
import type { CursorPosition } from '@collabboard/shared';
import type { useBoard } from '../../hooks/useBoard.js';
import { attachPanZoom } from './canvas/panZoom.js';
import { attachSelectionManager } from './canvas/selectionManager.js';
import { attachLocalModifications } from './canvas/localModifications.js';
import { getBoardId, findByBoardId, getNearestPorts } from './canvas/fabricHelpers.js';
import { TextEditingOverlay } from './canvas/TextEditingOverlay.js';
import { useObjectSync } from './canvas/useObjectSync.js';

/** Minimal descriptor for the currently Fabric-selected board object. */
export interface SelectedObject {
  /** UUID of the selected board object. */
  id: string;
  /** Discriminant from {@link BoardObject.type}. */
  type: string;
}

/** Canvas-space centre point of the visible viewport (used by AI placement). */
export interface SceneCenter {
  x: number;
  y: number;
}

/**
 * Current viewport transform state, emitted on every pan/zoom change.
 *
 * Used by {@link CursorOverlay} to convert remote cursor canvas-space
 * positions to screen pixels.
 */
export interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
}

/**
 * State for the text-editing overlay that appears over a sticky note or
 * frame title when the user double-clicks.
 *
 * Screen coordinates and dimensions are pre-computed from the Fabric
 * Group's position × the current zoom level.
 */
export interface EditingState {
  id: string;
  text: string;
  screenX: number;
  screenY: number;
  width: number;
  height: number;
  color: string;
  /** Rotation angle in degrees, used to CSS-rotate the textarea overlay. */
  rotation: number;
  /** The board object type being edited (sticky vs frame title). */
  objectType: 'sticky' | 'frame';
}

/**
 * Props for the {@link Canvas} component.
 *
 * @property objectsMap - The Yjs shared map (`Y.Map('objects')`).
 * @property board - {@link useBoard} return value — CRUD operations.
 * @property userCount - Number of online users (drives adaptive throttle).
 * @property activeTool - Current toolbar tool (`'select'`, `'sticky'`, `'connector'`, etc.).
 * @property onToolChange - Called when the Canvas internally resets the tool (e.g. after connector creation).
 * @property onCursorMove - Cursor broadcast callback from {@link useCursors}.
 * @property onSelectionChange - Notifies parent when the Fabric selection changes.
 * @property onReady - Called once with a `getSceneCenter` getter for AI placement.
 * @property onViewportChange - Called on every pan/zoom with the current viewport state.
 */
interface CanvasProps {
  objectsMap: Y.Map<unknown>;
  board: ReturnType<typeof useBoard>;
  userCount: number;
  activeTool: string;
  onToolChange: (tool: string) => void;
  onCursorMove: (position: CursorPosition, heavy?: boolean) => void;
  onSelectionChange: (selected: SelectedObject | null) => void;
  onReady: (getSceneCenter: () => SceneCenter) => void;
  onViewportChange: (viewport: ViewportState) => void;
}

/**
 * Imperative Fabric.js canvas orchestrator.
 *
 * This component is purely a wiring layer — it owns the refs, creates the
 * Fabric canvas, and delegates all behavior to focused submodules:
 *
 * - {@link attachPanZoom}: pan (alt/middle-click) and zoom (scroll wheel)
 * - {@link attachSelectionManager}: selection tracking and keyboard delete
 * - {@link attachLocalModifications}: object:moving/scaling/modified -> Yjs
 * - {@link useObjectSync}: Yjs observer + initial load -> Fabric
 *
 * The only business logic that remains here is the double-click-to-edit
 * handler for sticky notes, because it sets React state (`editingSticky`).
 */
export function Canvas({ objectsMap, board, userCount, activeTool, onToolChange, onCursorMove, onSelectionChange, onReady, onViewportChange }: CanvasProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);
  const isRemoteUpdateRef = useRef(false);
  const isLocalUpdateRef = useRef(false);
  const localUpdateIdsRef = useRef<Set<string>>(new Set());
  const lastObjectSyncRef = useRef<Record<string, number>>({});

  const [editingSticky, setEditingSticky] = useState<EditingState | null>(null);
  const editingStickyRef = useRef(editingSticky);
  editingStickyRef.current = editingSticky;

  // Connector creation mode: stores the first object ID while waiting for the second click
  const [pendingConnectorFrom, setPendingConnectorFrom] = useState<string | null>(null);

  // Keep refs in sync with latest props
  const boardRef = useRef(board);
  boardRef.current = board;
  const userCountRef = useRef(userCount);
  userCountRef.current = userCount;
  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;
  const onToolChangeRef = useRef(onToolChange);
  onToolChangeRef.current = onToolChange;
  const onCursorMoveRef = useRef(onCursorMove);
  onCursorMoveRef.current = onCursorMove;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;
  const pendingConnectorFromRef = useRef(pendingConnectorFrom);
  pendingConnectorFromRef.current = pendingConnectorFrom;

  // Initialize Fabric.js canvas — runs once on mount
  useEffect(() => {
    const canvasEl = canvasElRef.current;
    const container = containerRef.current;
    if (!canvasEl || !container) return;

    const canvas = new FabricCanvas(canvasEl, {
      width: container.clientWidth,
      height: container.clientHeight,
      backgroundColor: '#fafafa',
      selection: true,
    });
    fabricRef.current = canvas;

    // Expose scene center getter to parent
    onReadyRef.current(() => {
      const zoom = canvas.getZoom();
      const vpt = canvas.viewportTransform;
      if (!vpt) return { x: 0, y: 0 };
      const c = containerRef.current;
      const centerScreenX = (c?.clientWidth ?? window.innerWidth) / 2;
      const centerScreenY = (c?.clientHeight ?? window.innerHeight) / 2;
      return {
        x: (centerScreenX - vpt[4]) / zoom,
        y: (centerScreenY - vpt[5]) / zoom,
      };
    });

    // Delegate to submodules
    const cleanupPanZoom = attachPanZoom(canvas, onCursorMoveRef, onViewportChangeRef);
    const cleanupSelection = attachSelectionManager(canvas, boardRef, onSelectionChangeRef, editingStickyRef);
    const cleanupModifications = attachLocalModifications(
      canvas, boardRef, userCountRef,
      isRemoteUpdateRef, isLocalUpdateRef, localUpdateIdsRef, lastObjectSyncRef,
    );

    // Double-click to edit sticky note text or frame title — stays here because it sets React state
    const onDblClick = (opt: TPointerEventInfo<TPointerEvent>): void => {
      const target = opt.target;
      if (!target || !(target instanceof Group)) return;
      const id = getBoardId(target);
      if (!id) return;

      const boardData = boardRef.current.getObject(id);
      const objType = boardData?.type;

      const zoom = canvas.getZoom();
      const vpt = canvas.viewportTransform;
      if (!vpt) return;
      const screenX = (target.left ?? 0) * zoom + vpt[4];
      const screenY = (target.top ?? 0) * zoom + vpt[5];

      if (objType === 'frame') {
        // Frame: edit only the title area (top strip)
        const screenWidth = (target.width ?? 400) * zoom;
        const titleHeight = 30 * zoom;

        const textObj = target.getObjects().find((o) => o instanceof Textbox) as Textbox | undefined;
        const currentTitle = textObj?.text ?? '';

        target.set('opacity', 0);
        canvas.renderAll();

        setEditingSticky({
          id,
          text: currentTitle === 'Frame' ? '' : currentTitle,
          screenX,
          screenY,
          width: screenWidth,
          height: titleHeight,
          color: 'rgba(200, 200, 200, 0.3)',
          rotation: target.angle ?? 0,
          objectType: 'frame',
        });
      } else {
        // Sticky note: edit the full area
        const screenWidth = (target.width ?? 200) * zoom;
        const screenHeight = (target.height ?? 200) * zoom;

        const textObj = target.getObjects().find((o) => o instanceof Textbox) as Textbox | undefined;
        const bgObj = target.getObjects().find((o) => o instanceof Rect) as Rect | undefined;
        const currentText = textObj?.text ?? '';
        const stickyColor = (bgObj?.fill as string) ?? '#FFEB3B';

        target.set('opacity', 0);
        canvas.renderAll();

        setEditingSticky({
          id,
          text: currentText === 'Type here...' ? '' : currentText,
          screenX,
          screenY,
          width: screenWidth,
          height: screenHeight,
          color: stickyColor,
          rotation: target.angle ?? 0,
          objectType: 'sticky',
        });
      }
    };
    canvas.on('mouse:dblclick', onDblClick);

    // Connector creation mode: click first object, click second object
    const onMouseDown = (opt: TPointerEventInfo<TPointerEvent>): void => {
      if (activeToolRef.current !== 'connector') return;
      const target = opt.target;
      if (!target) {
        // Clicked empty space — cancel pending connector
        setPendingConnectorFrom(null);
        return;
      }
      const id = getBoardId(target);
      if (!id) return;

      // Don't allow connecting connectors to themselves
      const objData = boardRef.current.getObject(id);
      if (!objData || objData.type === 'connector') return;

      const pendingFrom = pendingConnectorFromRef.current;
      if (!pendingFrom) {
        // First click — store the source object
        setPendingConnectorFrom(id);
        canvas.discardActiveObject();
        canvas.renderAll();
      } else {
        // Second click — create the connector
        if (pendingFrom === id) {
          // Same object — ignore
          return;
        }
        const fromObj = findByBoardId(canvas, pendingFrom);
        const toObj = findByBoardId(canvas, id);
        if (fromObj && toObj) {
          const ports = getNearestPorts(fromObj, toObj);
          boardRef.current.createConnector(
            pendingFrom, id,
            ports.from.x, ports.from.y,
            ports.to.x, ports.to.y,
          );
        }
        setPendingConnectorFrom(null);
        onToolChangeRef.current('select');
      }
    };
    canvas.on('mouse:down', onMouseDown);

    // Handle window resize — use container dimensions, not window
    const handleResize = (): void => {
      const c = containerRef.current;
      if (!c) return;
      canvas.setDimensions({ width: c.clientWidth, height: c.clientHeight });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cleanupPanZoom();
      cleanupSelection();
      cleanupModifications();
      canvas.off('mouse:dblclick', onDblClick);
      canvas.off('mouse:down', onMouseDown);
      window.removeEventListener('resize', handleResize);
      canvas.dispose();
      fabricRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Yjs -> Fabric sync: initial load + live observer
  useObjectSync(fabricRef, objectsMap, isRemoteUpdateRef, isLocalUpdateRef, localUpdateIdsRef);

  // Restore opacity on the Fabric Group being edited
  const restoreEditingGroup = useCallback((): void => {
    const editing = editingStickyRef.current;
    if (!editing) return;
    const canvas = fabricRef.current;
    if (!canvas) return;
    const group = findByBoardId(canvas, editing.id);
    if (group) {
      group.set('opacity', 1);
      canvas.renderAll();
    }
  }, []);

  /**
   * Save sticky note text edit and close the overlay.
   *
   * Clears the editing ID from {@link localUpdateIdsRef} before writing so
   * that the Yjs observer in {@link useObjectSync} processes the text change
   * instead of silently skipping it. Without this, a previous drag/rotate
   * leaves the ID in the set, and the `||` short-circuit in
   * `syncObjectToCanvas` causes the text update to be swallowed.
   */
  const handleSaveEdit = useCallback(
    (text: string): void => {
      const editing = editingStickyRef.current;
      if (!editing) return;
      const finalText = text.trim() || '';
      // Flush stale per-object flag so the Yjs observer sees this write
      localUpdateIdsRef.current.delete(editing.id);
      if (editing.objectType === 'frame') {
        boardRef.current.updateObject(editing.id, { title: finalText || 'Frame' } as Partial<BoardObject>);
      } else {
        boardRef.current.updateObject(editing.id, { text: finalText } as Partial<BoardObject>);
      }
      restoreEditingGroup();
      setEditingSticky(null);
    },
    [restoreEditingGroup],
  );

  // Reset pending connector when tool changes away from 'connector'
  const prevToolRef = useRef(activeTool);
  if (prevToolRef.current === 'connector' && activeTool !== 'connector' && pendingConnectorFrom !== null) {
    setPendingConnectorFrom(null);
  }
  prevToolRef.current = activeTool;

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas ref={canvasElRef} style={{ display: 'block' }} />
      {activeTool === 'connector' && (
        <div style={{
          position: 'absolute',
          top: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(0,0,0,0.7)',
          color: '#fff',
          padding: '6px 16px',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 500,
          zIndex: 100,
          pointerEvents: 'none',
        }}>
          {pendingConnectorFrom
            ? 'Click the target object to draw the arrow'
            : 'Click the source object to start an arrow'}
        </div>
      )}
      {editingSticky && (
        <TextEditingOverlay
          editing={editingSticky}
          zoom={fabricRef.current?.getZoom() ?? 1}
          onSave={handleSaveEdit}
          onCancel={() => {
            restoreEditingGroup();
            setEditingSticky(null);
          }}
        />
      )}
    </div>
  );
}
