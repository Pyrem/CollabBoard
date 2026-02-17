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
import { DEFAULT_FILL, DEFAULT_STROKE } from '@collabboard/shared';
import type { useBoard } from '../../hooks/useBoard.js';

export interface SelectedObject {
  id: string;
  type: string;
}

interface CanvasProps {
  objectsMap: Y.Map<unknown>;
  board: ReturnType<typeof useBoard>;
  onCursorMove: (position: CursorPosition) => void;
  onSelectionChange: (selected: SelectedObject | null) => void;
}

interface EditingState {
  id: string;
  text: string;
  screenX: number;
  screenY: number;
  width: number;
  height: number;
}

export function Canvas({ objectsMap, board, onCursorMove, onSelectionChange }: CanvasProps): React.JSX.Element {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);
  const isRemoteUpdateRef = useRef(false);
  const isLocalUpdateRef = useRef(false);

  // State for sticky note inline text editing
  const [editingSticky, setEditingSticky] = useState<EditingState | null>(null);
  const editingStickyRef = useRef(editingSticky);
  editingStickyRef.current = editingSticky;

  // Keep refs in sync with latest props to avoid stale closures
  // without causing effect re-runs
  const boardRef = useRef(board);
  boardRef.current = board;
  const onCursorMoveRef = useRef(onCursorMove);
  onCursorMoveRef.current = onCursorMove;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

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
      opt.e.preventDefault();
      opt.e.stopPropagation();
    });

    // Track selection changes for color palette integration
    const notifySelection = (): void => {
      const active = canvas.getActiveObject();
      if (active) {
        const id = (active as unknown as { boardId?: string }).boardId;
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
      const id = (target as unknown as { boardId?: string }).boardId;
      if (!id) return;

      // Calculate screen position for the textarea overlay
      const zoom = canvas.getZoom();
      const vpt = canvas.viewportTransform;
      if (!vpt) return;
      const screenX = (target.left ?? 0) * zoom + vpt[4];
      const screenY = (target.top ?? 0) * zoom + vpt[5];
      const screenWidth = (target.width ?? 200) * zoom;
      const screenHeight = (target.height ?? 200) * zoom;

      // Get current text from Textbox sub-object
      const textObj = target.getObjects().find((o) => o instanceof Textbox) as Textbox | undefined;
      const currentText = textObj?.text ?? '';

      setEditingSticky({
        id,
        text: currentText === 'Type here...' ? '' : currentText,
        screenX,
        screenY,
        width: screenWidth,
        height: screenHeight,
      });
    });

    // Handle local object modifications -> sync to Yjs
    canvas.on('object:modified', (opt) => {
      if (isRemoteUpdateRef.current) return;
      const obj = opt.target;
      if (!obj) return;
      const id = (obj as unknown as { boardId?: string }).boardId;
      if (!id) return;

      const actualWidth = (obj.width ?? 0) * (obj.scaleX ?? 1);
      const actualHeight = (obj.height ?? 0) * (obj.scaleY ?? 1);

      // Guard: prevent the Yjs observer from re-syncing this object
      // back to the canvas while we're processing a local edit
      isLocalUpdateRef.current = true;

      boardRef.current.updateObject(id, {
        x: obj.left ?? 0,
        y: obj.top ?? 0,
        width: actualWidth,
        height: actualHeight,
        rotation: obj.angle ?? 0,
      });

      isLocalUpdateRef.current = false;

      // Normalize scale back to 1 after saving actual dimensions
      if (obj instanceof Group) {
        obj.set({ scaleX: 1, scaleY: 1, width: actualWidth, height: actualHeight });
      } else {
        obj.set({ scaleX: 1, scaleY: 1 });
      }
      obj.setCoords();
      canvas.renderAll();
    });

    // Handle window resize
    const handleResize = (): void => {
      canvas.setDimensions({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);

    return () => {
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

    const syncObjectToCanvas = (id: string, data: BoardObject): void => {
      // Skip if this change originated from a local object:modified handler
      if (isLocalUpdateRef.current) return;

      isRemoteUpdateRef.current = true;
      const existing = canvas.getObjects().find(
        (obj) => (obj as unknown as { boardId?: string }).boardId === id,
      );

      if (existing) {
        // Update existing object position/rotation
        existing.set({
          left: data.x,
          top: data.y,
          angle: data.rotation,
          scaleX: 1,
          scaleY: 1,
        });

        if (data.type === 'sticky' && existing instanceof Group) {
          const stickyData = data as StickyNote;
          const items = existing.getObjects();
          // Only update content properties — do NOT manually reposition
          // sub-objects as that conflicts with Fabric's Group layout manager
          const bgRect = items[0];
          if (bgRect instanceof Rect) {
            bgRect.set('fill', stickyData.color);
          }
          const textObj = items[1];
          if (textObj instanceof Textbox) {
            textObj.set('text', stickyData.text || 'Type here...');
          }
          // Invalidate Group's render cache so sub-object changes are painted
          existing.dirty = true;
        } else if (data.type === 'rectangle' && existing instanceof Rect) {
          const rectData = data as RectangleShape;
          existing.set({
            width: rectData.width,
            height: rectData.height,
          });
          existing.set('fill', rectData.fill || DEFAULT_FILL);
          existing.set('stroke', rectData.stroke || DEFAULT_STROKE);
        }
        existing.setCoords();
        canvas.renderAll();
      } else {
        // Create new object on canvas
        if (data.type === 'sticky') {
          const stickyData = data as StickyNote;
          const bg = new Rect({
            width: stickyData.width,
            height: stickyData.height,
            fill: stickyData.color,
            rx: 4,
            ry: 4,
            strokeWidth: 0,
          });

          const text = new Textbox(stickyData.text || 'Type here...', {
            fontSize: 16,
            fill: '#333',
            width: stickyData.width - 20,
            textAlign: 'left',
            splitByGrapheme: true,
          });

          const group = new Group([bg, text], {
            left: stickyData.x,
            top: stickyData.y,
            angle: stickyData.rotation,
            subTargetCheck: false,
            interactive: false,
          });

          (group as unknown as { boardId: string }).boardId = id;
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
            angle: rectData.rotation,
          });
          rect.set('fill', fillColor);
          rect.set('stroke', strokeColor);
          rect.dirty = true;
          (rect as unknown as { boardId: string }).boardId = id;
          canvas.add(rect);
          rect.setCoords();
        }
        canvas.renderAll();
      }
      isRemoteUpdateRef.current = false;
    };

    const removeObjectFromCanvas = (id: string): void => {
      isRemoteUpdateRef.current = true;
      const toRemove = canvas.getObjects().filter((obj) => {
        const bObj = obj as unknown as { boardId?: string };
        return bObj.boardId === id;
      });
      toRemove.forEach((obj) => canvas.remove(obj));
      canvas.renderAll();
      isRemoteUpdateRef.current = false;
    };

    // Initial load — sort by zIndex so objects layer correctly
    const objects: Array<[string, BoardObject]> = [];
    objectsMap.forEach((value, key) => {
      objects.push([key, value as BoardObject]);
    });
    objects.sort((a, b) => a[1].zIndex - b[1].zIndex);
    objects.forEach(([key, data]) => syncObjectToCanvas(key, data));

    // Observe Yjs map changes
    const observer = (events: Y.YMapEvent<unknown>): void => {
      events.changes.keys.forEach((change, key) => {
        if (change.action === 'add' || change.action === 'update') {
          const data = objectsMap.get(key) as BoardObject | undefined;
          if (data) syncObjectToCanvas(key, data);
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

  // Save sticky note text edit and close overlay
  const handleSaveEdit = useCallback(
    (text: string): void => {
      const editing = editingStickyRef.current;
      if (!editing) return;
      const finalText = text.trim() || '';
      boardRef.current.updateObject(editing.id, { text: finalText } as Partial<BoardObject>);
      setEditingSticky(null);
    },
    [],
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
            backgroundColor: 'transparent',
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
              setEditingSticky(null);
            }
          }}
        />
      )}
    </div>
  );
}
