import { useEffect, useRef } from 'react';
import {
  Canvas as FabricCanvas,
  Rect,
  Textbox,
  Group,
  type TPointerEvent,
  type TPointerEventInfo,
} from 'fabric';
import type * as Y from 'yjs';
import type { BoardObject, StickyNote } from '@collabboard/shared';
import type { CursorPosition } from '@collabboard/shared';
import type { useBoard } from '../../hooks/useBoard.js';

interface CanvasProps {
  objectsMap: Y.Map<unknown>;
  board: ReturnType<typeof useBoard>;
  onCursorMove: (position: CursorPosition) => void;
}

export function Canvas({ objectsMap, board, onCursorMove }: CanvasProps): React.JSX.Element {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);
  const isRemoteUpdateRef = useRef(false);
  const isLocalUpdateRef = useRef(false);

  // Keep refs in sync with latest props to avoid stale closures
  // without causing effect re-runs
  const boardRef = useRef(board);
  boardRef.current = board;
  const onCursorMoveRef = useRef(onCursorMove);
  onCursorMoveRef.current = onCursorMove;

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

      // For Groups (sticky notes), update internal objects to match new size
      if (obj instanceof Group) {
        const items = obj.getObjects();
        const bgRect = items[0];
        if (bgRect instanceof Rect) {
          bgRect.set({
            width: actualWidth,
            height: actualHeight,
            left: -actualWidth / 2,
            top: -actualHeight / 2,
          });
        }
        const textObj = items[1];
        if (textObj) {
          textObj.set({
            left: -actualWidth / 2 + 10,
            top: -actualHeight / 2 + 10,
            width: actualWidth - 20,
          });
        }
        obj.set({ scaleX: 1, scaleY: 1, width: actualWidth, height: actualHeight });
      } else {
        // Simple objects (rectangles)
        obj.set({ scaleX: 1, scaleY: 1 });
      }
      obj.setCoords();
      canvas.requestRenderAll();
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
          const items = existing.getObjects();
          const bgRect = items[0];
          if (bgRect instanceof Rect) {
            bgRect.set({
              width: data.width,
              height: data.height,
              fill: (data as StickyNote).color,
              left: -data.width / 2,
              top: -data.height / 2,
            });
          }
          const textObj = items[1];
          if (textObj instanceof Textbox) {
            textObj.set({
              text: (data as StickyNote).text,
              left: -data.width / 2 + 10,
              top: -data.height / 2 + 10,
              width: data.width - 20,
            });
          }
          existing.set({ width: data.width, height: data.height });
        } else if (data.type === 'rectangle' && existing instanceof Rect) {
          existing.set({
            width: data.width,
            height: data.height,
            fill: data.fill,
            stroke: data.stroke,
          });
        }
        existing.setCoords();
        canvas.requestRenderAll();
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
            originX: 'center',
            originY: 'center',
          });

          const text = new Textbox(stickyData.text || 'Type here...', {
            fontSize: 16,
            fill: '#333',
            width: stickyData.width - 20,
            originX: 'center',
            originY: 'center',
            textAlign: 'left',
            splitByGrapheme: true,
          });

          text.on('changed', () => {
            if (!isRemoteUpdateRef.current) {
              boardRef.current.updateObject(id, { text: text.text ?? '' } as Partial<BoardObject>);
            }
          });

          const group = new Group([bg, text], {
            left: stickyData.x,
            top: stickyData.y,
            angle: stickyData.rotation,
            subTargetCheck: true,
            interactive: true,
          });

          (group as unknown as { boardId: string }).boardId = id;
          canvas.add(group);
          group.setCoords();
        } else if (data.type === 'rectangle') {
          const rect = new Rect({
            left: data.x,
            top: data.y,
            width: data.width,
            height: data.height,
            fill: data.fill,
            stroke: data.stroke,
            strokeWidth: 2,
            angle: data.rotation,
          });
          (rect as unknown as { boardId: string }).boardId = id;
          canvas.add(rect);
          rect.setCoords();
        }
        canvas.requestRenderAll();
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
      canvas.requestRenderAll();
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

  return (
    <canvas ref={canvasElRef} style={{ display: 'block' }} />
  );
}
