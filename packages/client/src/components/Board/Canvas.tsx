import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Canvas as FabricCanvas,
  Rect,
  Textbox,
  Group,
  type TPointerEvent,
  type TPointerEventInfo,
  type FabricObject,
} from 'fabric';
import type * as Y from 'yjs';
import type { BoardObject, StickyNote, RectangleShape } from '@collabboard/shared';
import type { CursorPosition } from '@collabboard/shared';
import { DEFAULT_FILL, DEFAULT_STROKE, getObjectSyncThrottle, validateBoardObject } from '@collabboard/shared';
import type { useBoard } from '../../hooks/useBoard.js';

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

interface CanvasProps {
  objectsMap: Y.Map<unknown>;
  board: ReturnType<typeof useBoard>;
  userCount: number;
  onCursorMove: (position: CursorPosition) => void;
  onSelectionChange: (selected: SelectedObject | null) => void;
  onReady: (getSceneCenter: () => SceneCenter) => void;
  onViewportChange: (viewport: ViewportState) => void;
}

interface EditingState {
  id: string;
  text: string;
  screenX: number;
  screenY: number;
  width: number;
  height: number;
  color: string;
}

// Helper: get boardId from a Fabric object
function getBoardId(obj: FabricObject): string | undefined {
  return (obj as unknown as { boardId?: string }).boardId;
}

// Helper: set boardId on a Fabric object
function setBoardId(obj: FabricObject, id: string): void {
  (obj as unknown as { boardId: string }).boardId = id;
}

// Helpers: track sticky note content on the Fabric Group to detect position-only updates
function setStickyContent(obj: FabricObject, text: string, color: string): void {
  const record = obj as unknown as { _stickyText: string; _stickyColor: string };
  record._stickyText = text;
  record._stickyColor = color;
}

function getStickyContent(obj: FabricObject): { text: string; color: string } | undefined {
  const record = obj as unknown as { _stickyText?: string; _stickyColor?: string };
  if (record._stickyText !== undefined && record._stickyColor !== undefined) {
    return { text: record._stickyText, color: record._stickyColor };
  }
  return undefined;
}

// Helper: create a sticky note Group from data
function createStickyGroup(stickyData: StickyNote): Group {
  const bg = new Rect({
    width: stickyData.width,
    height: stickyData.height,
    fill: stickyData.color,
    rx: 4,
    ry: 4,
    stroke: null,
    strokeWidth: 0,
  });

  const text = new Textbox(stickyData.text || 'Type here...', {
    fontSize: 16,
    fill: '#333',
    width: stickyData.width - 20,
    textAlign: 'left',
    splitByGrapheme: true,
    stroke: null,
    strokeWidth: 0,
  });

  const group = new Group([bg, text], {
    left: stickyData.x,
    top: stickyData.y,
    subTargetCheck: false,
    interactive: false,
    // Disable rotation and resize — sticky notes are fixed-size
    lockRotation: true,
    lockScalingX: true,
    lockScalingY: true,
    hasControls: false,
  });

  // After Group creation, explicitly position sub-objects so that
  // the bg fills the entire Group and text has consistent padding.
  // The layout manager may place the Textbox at an unexpected offset
  // due to text measurement differences in the browser.
  const halfW = group.width / 2;
  const halfH = group.height / 2;
  bg.set({ left: -halfW, top: -halfH, width: group.width, height: group.height });
  text.set({ left: -halfW + 10, top: -halfH + 10, width: group.width - 20 });
  group.dirty = true;

  return group;
}

export function Canvas({ objectsMap, board, userCount, onCursorMove, onSelectionChange, onReady, onViewportChange }: CanvasProps): React.JSX.Element {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);
  const isRemoteUpdateRef = useRef(false);
  const isLocalUpdateRef = useRef(false);
  const localUpdateIdsRef = useRef<Set<string>>(new Set());
  const lastObjectSyncRef = useRef<Record<string, number>>({});

  // State for sticky note inline text editing
  const [editingSticky, setEditingSticky] = useState<EditingState | null>(null);
  const editingStickyRef = useRef(editingSticky);
  editingStickyRef.current = editingSticky;

  // Keep refs in sync with latest props to avoid stale closures
  // without causing effect re-runs
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

    // Expose a function to get the center of the visible scene area
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

    // Helper: emit current viewport transform to parent
    const emitViewport = (): void => {
      const vpt = canvas.viewportTransform;
      if (!vpt) return;
      onViewportChangeRef.current({ zoom: canvas.getZoom(), panX: vpt[4], panY: vpt[5] });
    };

    // Pan/zoom setup
    let isPanning = false;
    let lastPosX = 0;
    let lastPosY = 0;

    canvas.on('mouse:down', (opt: TPointerEventInfo<TPointerEvent>) => {
      const evt = opt.e as MouseEvent;
      if (evt.altKey || evt.button === 1) {
        isPanning = true;
        lastPosX = evt.clientX;
        lastPosY = evt.clientY;
        canvas.selection = false;
      }
    });

    canvas.on('mouse:move', (opt: TPointerEventInfo<TPointerEvent>) => {
      const evt = opt.e as MouseEvent;
      const pointer = canvas.getScenePoint(evt);
      onCursorMoveRef.current({ x: pointer.x, y: pointer.y });

      if (isPanning) {
        const dx = evt.clientX - lastPosX;
        const dy = evt.clientY - lastPosY;
        const vpt = canvas.viewportTransform;
        if (vpt) {
          vpt[4] += dx;
          vpt[5] += dy;
          canvas.setViewportTransform(vpt);
          emitViewport();
        }
        lastPosX = evt.clientX;
        lastPosY = evt.clientY;
      }
    });

    canvas.on('mouse:up', () => {
      isPanning = false;
      canvas.selection = true;
    });

    // Zoom with scroll wheel
    canvas.on('mouse:wheel', (opt: TPointerEventInfo<WheelEvent>) => {
      const delta = opt.e.deltaY;
      let zoom = canvas.getZoom();
      zoom *= 0.999 ** delta;
      zoom = Math.min(Math.max(zoom, 0.1), 5);
      canvas.zoomToPoint(canvas.getScenePoint(opt.e), zoom);
      emitViewport();
      opt.e.preventDefault();
      opt.e.stopPropagation();
    });

    // Track selection changes for color palette integration
    const notifySelection = (): void => {
      const active = canvas.getActiveObject();
      if (active) {
        const id = getBoardId(active);
        if (id) {
          const data = boardRef.current.getObject(id);
          onSelectionChangeRef.current(data ? { id, type: data.type } : null);
          return;
        }
      }
      onSelectionChangeRef.current(null);
    };
    canvas.on('selection:created', notifySelection);
    canvas.on('selection:updated', notifySelection);
    canvas.on('selection:cleared', notifySelection);

    // Double-click to edit sticky note text via HTML textarea overlay
    canvas.on('mouse:dblclick', (opt: TPointerEventInfo<TPointerEvent>) => {
      const target = opt.target;
      if (!target || !(target instanceof Group)) return;
      const id = getBoardId(target);
      if (!id) return;

      // Calculate screen position for the textarea overlay
      const zoom = canvas.getZoom();
      const vpt = canvas.viewportTransform;
      if (!vpt) return;
      const screenX = (target.left ?? 0) * zoom + vpt[4];
      const screenY = (target.top ?? 0) * zoom + vpt[5];
      const screenWidth = (target.width ?? 200) * zoom;
      const screenHeight = (target.height ?? 200) * zoom;

      // Get current text and color from sub-objects
      const textObj = target.getObjects().find((o) => o instanceof Textbox) as Textbox | undefined;
      const bgObj = target.getObjects().find((o) => o instanceof Rect) as Rect | undefined;
      const currentText = textObj?.text ?? '';
      const stickyColor = (bgObj?.fill as string) ?? '#FFEB3B';

      // Hide the Group so its text doesn't show through the textarea
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
    });

    // Broadcast intermediate position updates during drag (throttled)
    canvas.on('object:moving', (opt) => {
      if (isRemoteUpdateRef.current) return;
      const obj = opt.target;
      if (!obj) return;
      const id = getBoardId(obj);
      if (!id) return;

      const now = Date.now();
      const lastSync = lastObjectSyncRef.current[id] ?? 0;
      if (now - lastSync < getObjectSyncThrottle(userCountRef.current)) return;
      lastObjectSyncRef.current[id] = now;

      localUpdateIdsRef.current.add(id);
      isLocalUpdateRef.current = true;
      boardRef.current.updateObject(id, {
        x: obj.left ?? 0,
        y: obj.top ?? 0,
      });
      isLocalUpdateRef.current = false;
    });

    // Broadcast intermediate size updates during resize (throttled)
    canvas.on('object:scaling', (opt) => {
      if (isRemoteUpdateRef.current) return;
      const obj = opt.target;
      if (!obj) return;
      const id = getBoardId(obj);
      if (!id) return;

      const now = Date.now();
      const lastSync = lastObjectSyncRef.current[id] ?? 0;
      if (now - lastSync < getObjectSyncThrottle(userCountRef.current)) return;
      lastObjectSyncRef.current[id] = now;

      const actualWidth = (obj.width ?? 0) * (obj.scaleX ?? 1);
      const actualHeight = (obj.height ?? 0) * (obj.scaleY ?? 1);

      localUpdateIdsRef.current.add(id);
      isLocalUpdateRef.current = true;
      boardRef.current.updateObject(id, {
        x: obj.left ?? 0,
        y: obj.top ?? 0,
        width: actualWidth,
        height: actualHeight,
      });
      isLocalUpdateRef.current = false;
    });

    // Handle local object modifications -> sync to Yjs (final authoritative update on mouse release)
    canvas.on('object:modified', (opt) => {
      if (isRemoteUpdateRef.current) return;
      const obj = opt.target;
      if (!obj) return;
      const id = getBoardId(obj);
      if (!id) return;

      // Reset throttle so the final update always fires immediately
      delete lastObjectSyncRef.current[id];

      // Guard: prevent the Yjs observer from re-syncing this object
      // back to the canvas while we're processing a local edit
      localUpdateIdsRef.current.add(id);
      isLocalUpdateRef.current = true;

      if (obj instanceof Group) {
        // Sticky notes: fixed size, only position changes
        boardRef.current.updateObject(id, {
          x: obj.left ?? 0,
          y: obj.top ?? 0,
        });
      } else {
        // Rectangles: can resize
        const actualWidth = (obj.width ?? 0) * (obj.scaleX ?? 1);
        const actualHeight = (obj.height ?? 0) * (obj.scaleY ?? 1);

        boardRef.current.updateObject(id, {
          x: obj.left ?? 0,
          y: obj.top ?? 0,
          width: actualWidth,
          height: actualHeight,
        });

        // Normalize scale back to 1 after saving actual dimensions
        obj.set({ scaleX: 1, scaleY: 1, width: actualWidth, height: actualHeight });
        obj.setCoords();
      }

      isLocalUpdateRef.current = false;
      canvas.renderAll();
    });

    // Delete selected object with Delete or Backspace key
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      // Don't delete when typing in an input or textarea
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      // Don't delete while editing a sticky note
      if (editingStickyRef.current) return;

      const active = canvas.getActiveObject();
      if (!active) return;
      const id = getBoardId(active);
      if (!id) return;

      e.preventDefault();
      canvas.discardActiveObject();
      boardRef.current.deleteObject(id);
      onSelectionChangeRef.current(null);
    };
    window.addEventListener('keydown', handleKeyDown);

    // Handle window resize
    const handleResize = (): void => {
      canvas.setDimensions({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
      canvas.dispose();
      fabricRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Observe Yjs changes and sync to Fabric canvas
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const findByBoardId = (id: string): FabricObject | undefined =>
      canvas.getObjects().find((obj) => getBoardId(obj) === id);

    const syncObjectToCanvas = (id: string, data: BoardObject): void => {
      // Skip if this change originated from a local handler (flag or per-object tracking)
      if (isLocalUpdateRef.current || localUpdateIdsRef.current.delete(id)) return;

      isRemoteUpdateRef.current = true;
      const existing = findByBoardId(id);

      if (existing) {
        if (data.type === 'sticky') {
          const stickyData = data as StickyNote;
          const prev = getStickyContent(existing);

          if (prev && prev.text === stickyData.text && prev.color === stickyData.color) {
            // Position-only update — lightweight move, no Group recreation
            existing.set({ left: stickyData.x, top: stickyData.y });
            existing.setCoords();
          } else {
            // Content changed (text or color) — full recreation needed
            // to work around Fabric.js Group layout manager issues
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
          const rectData = data as RectangleShape;
          existing.set({
            left: rectData.x,
            top: rectData.y,
            width: rectData.width,
            height: rectData.height,
            scaleX: 1,
            scaleY: 1,
          });
          existing.set('fill', rectData.fill || DEFAULT_FILL);
          existing.set('stroke', rectData.stroke || DEFAULT_STROKE);
          existing.setCoords();
        }
        canvas.renderAll();
      } else {
        // Create new object on canvas
        if (data.type === 'sticky') {
          const stickyData = data as StickyNote;
          const group = createStickyGroup(stickyData);
          setBoardId(group, id);
          setStickyContent(group, stickyData.text, stickyData.color);
          canvas.add(group);
          group.setCoords();
        } else if (data.type === 'rectangle') {
          const rectData = data as RectangleShape;
          const fillColor = rectData.fill || DEFAULT_FILL;
          const strokeColor = rectData.stroke || DEFAULT_STROKE;
          const rect = new Rect({
            left: rectData.x,
            top: rectData.y,
            width: rectData.width,
            height: rectData.height,
            strokeWidth: 2,
            // Disable rotation
            lockRotation: true,
          });
          rect.set('fill', fillColor);
          rect.set('stroke', strokeColor);
          rect.dirty = true;
          // Hide the rotation control
          rect.setControlVisible('mtr', false);
          setBoardId(rect, id);
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

    // Initial load — validate and sort by zIndex so objects layer correctly
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

    // Observe Yjs map changes — validate before applying
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
    const group = canvas.getObjects().find((obj) => getBoardId(obj) === editing.id);
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
      // Restore opacity before closing — the Yjs update will recreate the Group
      // with full opacity, but restore just in case timing differs
      restoreEditingGroup();
      setEditingSticky(null);
    },
    [restoreEditingGroup],
  );

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas ref={canvasElRef} style={{ display: 'block' }} />
      {editingSticky && (
        <textarea
          style={{
            position: 'absolute',
            left: editingSticky.screenX,
            top: editingSticky.screenY,
            width: editingSticky.width,
            height: editingSticky.height,
            fontSize: 16 * (fabricRef.current?.getZoom() ?? 1),
            fontFamily: 'sans-serif',
            color: '#333',
            backgroundColor: editingSticky.color,
            border: '2px solid #2196F3',
            borderRadius: 4,
            padding: 10,
            resize: 'none',
            outline: 'none',
            zIndex: 200,
            boxSizing: 'border-box',
          }}
          defaultValue={editingSticky.text}
          autoFocus
          onBlur={(e) => handleSaveEdit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              restoreEditingGroup();
              setEditingSticky(null);
            }
          }}
        />
      )}
    </div>
  );
}
