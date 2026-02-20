import { Canvas as FabricCanvas, Group } from 'fabric';
import type { MutableRefObject, RefObject } from 'react';
import { getObjectSyncThrottle } from '@collabboard/shared';
import type { useBoard } from '../../../hooks/useBoard.js';
import { getBoardId } from './fabricHelpers.js';

/**
 * Attach object:moving, object:scaling, and object:modified listeners
 * that sync local Fabric changes back to Yjs.
 * Returns a cleanup function.
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
    disposeModified();
  };
}
