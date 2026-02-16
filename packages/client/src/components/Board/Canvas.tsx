import { useEffect, useRef, useCallback } from 'react';
import { Canvas as FabricCanvas, Rect, IText, type TPointerEvent, type TPointerEventInfo } from 'fabric';
import type * as Y from 'yjs';
import type { BoardObject } from '@collabboard/shared';
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

  // Initialize Fabric.js canvas
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
      // Broadcast cursor position
      const pointer = canvas.getScenePoint(evt);
      onCursorMove({ x: pointer.x, y: pointer.y });

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

      board.updateObject(id, {
        x: obj.left ?? 0,
        y: obj.top ?? 0,
        width: (obj.width ?? 0) * (obj.scaleX ?? 1),
        height: (obj.height ?? 0) * (obj.scaleY ?? 1),
        rotation: obj.angle ?? 0,
      });
      // Reset scale after applying to width/height
      obj.set({ scaleX: 1, scaleY: 1 });
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
  }, [board, onCursorMove]);

  // Observe Yjs changes and sync to Fabric
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const syncObjectToCanvas = (id: string, data: BoardObject): void => {
      isRemoteUpdateRef.current = true;
      const existing = canvas.getObjects().find(
        (obj) => (obj as unknown as { boardId?: string }).boardId === id,
      );

      if (existing) {
        // Update existing object
        if (data.type === 'sticky') {
          existing.set({
            left: data.x,
            top: data.y,
            width: data.width,
            height: data.height,
            angle: data.rotation,
          });
          if (existing instanceof IText) {
            existing.set({ text: data.text });
          }
        } else if (data.type === 'rectangle') {
          existing.set({
            left: data.x,
            top: data.y,
            width: data.width,
            height: data.height,
            angle: data.rotation,
            fill: data.fill,
            stroke: data.stroke,
          });
        }
        canvas.requestRenderAll();
      } else {
        // Create new object on canvas
        let fabricObj: Rect | IText | null = null;

        if (data.type === 'sticky') {
          // Sticky note: colored rectangle with text
          const bg = new Rect({
            left: data.x,
            top: data.y,
            width: data.width,
            height: data.height,
            fill: data.color,
            rx: 4,
            ry: 4,
            angle: data.rotation,
            strokeWidth: 0,
          });
          (bg as unknown as { boardId: string }).boardId = id;
          canvas.add(bg);

          const text = new IText(data.text || 'Type here...', {
            left: data.x + 10,
            top: data.y + 10,
            width: data.width - 20,
            fontSize: 16,
            fill: '#333',
            angle: data.rotation,
          });
          (text as unknown as { boardId: string; parentBoardId: string }).boardId = id + '_text';
          (text as unknown as { boardId: string; parentBoardId: string }).parentBoardId = id;

          text.on('changed', () => {
            if (!isRemoteUpdateRef.current) {
              board.updateObject(id, { text: text.text ?? '' } as Partial<BoardObject>);
            }
          });

          canvas.add(text);
          fabricObj = bg;
        } else if (data.type === 'rectangle') {
          fabricObj = new Rect({
            left: data.x,
            top: data.y,
            width: data.width,
            height: data.height,
            fill: data.fill,
            stroke: data.stroke,
            strokeWidth: 2,
            angle: data.rotation,
          });
          (fabricObj as unknown as { boardId: string }).boardId = id;
          canvas.add(fabricObj);
        }

        if (fabricObj) {
          canvas.requestRenderAll();
        }
      }
      isRemoteUpdateRef.current = false;
    };

    const removeObjectFromCanvas = (id: string): void => {
      isRemoteUpdateRef.current = true;
      const toRemove = canvas.getObjects().filter(
        (obj) => {
          const bObj = obj as unknown as { boardId?: string; parentBoardId?: string };
          return bObj.boardId === id || bObj.parentBoardId === id || bObj.boardId === id + '_text';
        },
      );
      toRemove.forEach((obj) => canvas.remove(obj));
      canvas.requestRenderAll();
      isRemoteUpdateRef.current = false;
    };

    // Initial load of all objects
    objectsMap.forEach((value, key) => {
      syncObjectToCanvas(key, value as BoardObject);
    });

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
  }, [objectsMap, board]);

  return (
    <canvas ref={canvasElRef} style={{ display: 'block' }} />
  );
}
