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
import type { BoardObject, StickyNote, RectangleShape } from '@collabboard/shared';
import type { CursorPosition } from '@collabboard/shared';
import { DEFAULT_FILL, DEFAULT_STROKE, validateBoardObject } from '@collabboard/shared';
import type { useBoard } from '../../hooks/useBoard.js';
import { attachPanZoom } from './canvas/panZoom.js';
import { attachSelectionManager } from './canvas/selectionManager.js';
import { attachLocalModifications } from './canvas/localModifications.js';
import {
  getBoardId,
  setBoardId,
  getStickyContent,
  setStickyContent,
  createStickyGroup,
  createRectFromData,
  updateRectFromData,
  findByBoardId,
} from './canvas/fabricHelpers.js';
import { TextEditingOverlay } from './canvas/TextEditingOverlay.js';

export interface SelectedObject {
  id: string;
  type: string;
}

export interface SceneCenter {
  x: number;
  y: number;
}

export interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
}

export interface EditingState {
  id: string;
  text: string;
  screenX: number;
  screenY: number;
  width: number;
  height: number;
  color: string;
}

interface CanvasProps {
  objectsMap: Y.Map<unknown>;
  board: ReturnType<typeof useBoard>;
  userCount: number;
  onCursorMove: (position: CursorPosition) => void;
  onSelectionChange: (selected: SelectedObject | null) => void;
  onReady: (getSceneCenter: () => SceneCenter) => void;
  onViewportChange: (viewport: ViewportState) => void;
}

/**
 * Imperative Fabric.js canvas that stays in sync with a Yjs shared map.
 *
 * Mount effect creates the canvas and delegates to submodules:
 * - panZoom: pan (alt/middle-click) and zoom (scroll wheel)
 * - selectionManager: selection tracking and keyboard delete
 * - localModifications: object:moving/scaling/modified -> Yjs
 *
 * Sync effect (depends on objectsMap) handles Yjs observer + initial load.
 * This will move to useObjectSync in Story 2.
 */
export function Canvas({ objectsMap, board, userCount, onCursorMove, onSelectionChange, onReady, onViewportChange }: CanvasProps): React.JSX.Element {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);
  const isRemoteUpdateRef = useRef(false);
  const isLocalUpdateRef = useRef(false);
  const localUpdateIdsRef = useRef<Set<string>>(new Set());
  const lastObjectSyncRef = useRef<Record<string, number>>({});

  const [editingSticky, setEditingSticky] = useState<EditingState | null>(null);
  const editingStickyRef = useRef(editingSticky);
  editingStickyRef.current = editingSticky;

  // Keep refs in sync with latest props
  const boardRef = useRef(board);
  boardRef.current = board;
  const userCountRef = useRef(userCount);
  userCountRef.current = userCount;
  const onCursorMoveRef = useRef(onCursorMove);
  onCursorMoveRef.current = onCursorMove;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;

  // Initialize Fabric.js canvas — runs once on mount
  useEffect(() => {
    const canvasEl = canvasElRef.current;
    if (!canvasEl) return;

    const canvas = new FabricCanvas(canvasEl, {
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: '#fafafa',
      selection: true,
    });
    fabricRef.current = canvas;

    // Expose scene center getter to parent
    onReadyRef.current(() => {
      const zoom = canvas.getZoom();
      const vpt = canvas.viewportTransform;
      if (!vpt) return { x: 0, y: 0 };
      const centerScreenX = window.innerWidth / 2;
      const centerScreenY = window.innerHeight / 2;
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

    // Double-click to edit sticky note text — stays here because it sets React state
    const onDblClick = (opt: TPointerEventInfo<TPointerEvent>): void => {
      const target = opt.target;
      if (!target || !(target instanceof Group)) return;
      const id = getBoardId(target);
      if (!id) return;

      const zoom = canvas.getZoom();
      const vpt = canvas.viewportTransform;
      if (!vpt) return;
      const screenX = (target.left ?? 0) * zoom + vpt[4];
      const screenY = (target.top ?? 0) * zoom + vpt[5];
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
      });
    };
    canvas.on('mouse:dblclick', onDblClick);

    // Handle window resize
    const handleResize = (): void => {
      canvas.setDimensions({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cleanupPanZoom();
      cleanupSelection();
      cleanupModifications();
      canvas.off('mouse:dblclick', onDblClick);
      window.removeEventListener('resize', handleResize);
      canvas.dispose();
      fabricRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Observe Yjs changes and sync to Fabric canvas
  // (Story 2 will extract this into useObjectSync)
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const syncObjectToCanvas = (id: string, data: BoardObject): void => {
      if (isLocalUpdateRef.current || localUpdateIdsRef.current.delete(id)) return;

      isRemoteUpdateRef.current = true;
      const existing = findByBoardId(canvas, id);

      if (existing) {
        if (data.type === 'sticky') {
          const stickyData = data as StickyNote;
          const prev = getStickyContent(existing);

          if (prev && prev.text === stickyData.text && prev.color === stickyData.color) {
            existing.set({ left: stickyData.x, top: stickyData.y });
            existing.setCoords();
          } else {
            const wasActive = canvas.getActiveObject() === existing;
            canvas.remove(existing);
            const group = createStickyGroup(stickyData);
            setBoardId(group, id);
            setStickyContent(group, stickyData.text, stickyData.color);
            canvas.add(group);
            group.setCoords();
            if (wasActive) {
              canvas.setActiveObject(group);
            }
          }
        } else if (data.type === 'rectangle' && existing instanceof Rect) {
          updateRectFromData(existing, data as RectangleShape);
        }
        canvas.renderAll();
      } else {
        if (data.type === 'sticky') {
          const stickyData = data as StickyNote;
          const group = createStickyGroup(stickyData);
          setBoardId(group, id);
          setStickyContent(group, stickyData.text, stickyData.color);
          canvas.add(group);
          group.setCoords();
        } else if (data.type === 'rectangle') {
          const rect = createRectFromData(data as RectangleShape);
          canvas.add(rect);
          rect.setCoords();
        }
        canvas.renderAll();
      }
      isRemoteUpdateRef.current = false;
    };

    const removeObjectFromCanvas = (id: string): void => {
      isRemoteUpdateRef.current = true;
      const toRemove = canvas.getObjects().filter((obj) => getBoardId(obj) === id);
      toRemove.forEach((obj) => canvas.remove(obj));
      canvas.renderAll();
      isRemoteUpdateRef.current = false;
    };

    // Initial load
    const objects: Array<[string, BoardObject]> = [];
    objectsMap.forEach((value, key) => {
      const validated = validateBoardObject(value);
      if (validated) {
        objects.push([key, validated]);
      } else {
        console.warn(`[Canvas] Ignoring malformed object "${key}"`, value);
      }
    });
    objects.sort((a, b) => a[1].zIndex - b[1].zIndex);
    objects.forEach(([key, data]) => syncObjectToCanvas(key, data));

    const observer = (events: Y.YMapEvent<unknown>): void => {
      events.changes.keys.forEach((change, key) => {
        if (change.action === 'add' || change.action === 'update') {
          const raw = objectsMap.get(key);
          const data = validateBoardObject(raw);
          if (data) {
            syncObjectToCanvas(key, data);
          } else {
            console.warn(`[Canvas] Ignoring malformed object "${key}"`, raw);
          }
        } else if (change.action === 'delete') {
          removeObjectFromCanvas(key);
        }
      });
    };

    objectsMap.observe(observer);

    return () => {
      objectsMap.unobserve(observer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectsMap]);

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

  // Save sticky note text edit and close overlay
  const handleSaveEdit = useCallback(
    (text: string): void => {
      const editing = editingStickyRef.current;
      if (!editing) return;
      const finalText = text.trim() || '';
      boardRef.current.updateObject(editing.id, { text: finalText } as Partial<BoardObject>);
      restoreEditingGroup();
      setEditingSticky(null);
    },
    [restoreEditingGroup],
  );

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas ref={canvasElRef} style={{ display: 'block' }} />
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
