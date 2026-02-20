import { Canvas as FabricCanvas, Group } from 'fabric';
import type { MutableRefObject, RefObject } from 'react';
import { getObjectSyncThrottle } from '@collabboard/shared';
import type { useBoard } from '../../../hooks/useBoard.js';
import { getBoardId } from './fabricHelpers.js';

/**
 * Attach object:moving, object:scaling, object:rotating, and object:modified
 * listeners that sync local Fabric changes back to Yjs.
 *
 * `object:rotating` broadcasts the angle during the drag so remote users see
 * a live preview. `object:modified` fires once on mouse-up and writes the
 * final position, size, and rotation (normalising scale back to 1).
 *
 * @returns A cleanup function that removes all listeners.
 */
export function attachLocalModifications(
  canvas: FabricCanvas,
  boardRef: RefObject<ReturnType<typeof useBoard>>,
  userCountRef: RefObject<number>,
  isRemoteUpdateRef: MutableRefObject<boolean>,
  isLocalUpdateRef: MutableRefObject<boolean>,
  localUpdateIdsRef: MutableRefObject<Set<string>>,
  lastObjectSyncRef: MutableRefObject<Record<string, number>>,
): () => void {
  // canvas.on() returns a VoidFunction disposer in Fabric v6
  const disposeMoving = canvas.on('object:moving', (opt) => {
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

  const disposeScaling = canvas.on('object:scaling', (opt) => {
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

  const disposeRotating = canvas.on('object:rotating', (opt) => {
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
      rotation: obj.angle ?? 0,
    });
    isLocalUpdateRef.current = false;
  });

  const disposeModified = canvas.on('object:modified', (opt) => {
    if (isRemoteUpdateRef.current) return;
    const obj = opt.target;
    if (!obj) return;
    const id = getBoardId(obj);
    if (!id) return;

    delete lastObjectSyncRef.current[id];

    localUpdateIdsRef.current.add(id);
    isLocalUpdateRef.current = true;

    if (obj instanceof Group) {
      // Sticky notes: position only (rotation stays locked on Groups)
      boardRef.current.updateObject(id, {
        x: obj.left ?? 0,
        y: obj.top ?? 0,
      });
    } else {
      const actualWidth = (obj.width ?? 0) * (obj.scaleX ?? 1);
      const actualHeight = (obj.height ?? 0) * (obj.scaleY ?? 1);

      boardRef.current.updateObject(id, {
        x: obj.left ?? 0,
        y: obj.top ?? 0,
        width: actualWidth,
        height: actualHeight,
        rotation: obj.angle ?? 0,
      });

      obj.set({ scaleX: 1, scaleY: 1, width: actualWidth, height: actualHeight });
      obj.setCoords();
    }

    isLocalUpdateRef.current = false;
    canvas.renderAll();
  });

  return () => {
    disposeMoving();
    disposeScaling();
    disposeRotating();
    disposeModified();
  };
}
