import { Canvas as FabricCanvas, Group, ActiveSelection, util } from 'fabric';
import type { MutableRefObject, RefObject } from 'react';
import { getObjectSyncThrottle, logger } from '@collabboard/shared';
import type { BoardObject } from '@collabboard/shared';
import type { useBoard } from '../../../hooks/useBoard.js';
import { getBoardId } from './fabricHelpers.js';

const log = logger('throttle');

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

    const now = performance.now();
    const lastSync = lastObjectSyncRef.current[id] ?? 0;
    const threshold = getObjectSyncThrottle(userCountRef.current);
    const elapsed = now - lastSync;
    if (elapsed < threshold) {
      log.debug('object:moving skipped', { id, elapsed: Math.round(elapsed), threshold });
      return;
    }
    lastObjectSyncRef.current[id] = now;

    log.debug('object:moving synced', { id, x: obj.left ?? 0, y: obj.top ?? 0 });
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

    const now = performance.now();
    const lastSync = lastObjectSyncRef.current[id] ?? 0;
    const threshold = getObjectSyncThrottle(userCountRef.current);
    const elapsed = now - lastSync;
    if (elapsed < threshold) {
      log.debug('object:scaling skipped', { id, elapsed: Math.round(elapsed), threshold });
      return;
    }
    lastObjectSyncRef.current[id] = now;

    const actualWidth = (obj.width ?? 0) * (obj.scaleX ?? 1);
    const actualHeight = (obj.height ?? 0) * (obj.scaleY ?? 1);

    log.debug('object:scaling synced', { id, width: Math.round(actualWidth), height: Math.round(actualHeight) });
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

    const now = performance.now();
    const lastSync = lastObjectSyncRef.current[id] ?? 0;
    const threshold = getObjectSyncThrottle(userCountRef.current);
    const elapsed = now - lastSync;
    if (elapsed < threshold) {
      log.debug('object:rotating skipped', { id, elapsed: Math.round(elapsed), threshold });
      return;
    }
    lastObjectSyncRef.current[id] = now;

    log.debug('object:rotating synced', { id, angle: Math.round(obj.angle ?? 0) });
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

    if (obj instanceof ActiveSelection) {
      // Multi-object modification: decompose each child's world transform
      const children = obj.getObjects();
      const updates: Array<{ id: string; updates: Partial<BoardObject> }> = [];

      for (const child of children) {
        const childId = getBoardId(child);
        if (!childId) continue;

        // calcTransformMatrix() returns the child's full world matrix
        // (including the ActiveSelection group transform)
        const worldMatrix = child.calcTransformMatrix();
        const decomposed = util.qrDecompose(worldMatrix);

        delete lastObjectSyncRef.current[childId];
        localUpdateIdsRef.current.add(childId);

        if (child instanceof Group) {
          // Sticky notes: position + rotation only (fixed-size)
          updates.push({
            id: childId,
            updates: {
              x: decomposed.translateX,
              y: decomposed.translateY,
              rotation: decomposed.angle,
            },
          });
        } else {
          const actualWidth = (child.width ?? 0) * decomposed.scaleX;
          const actualHeight = (child.height ?? 0) * decomposed.scaleY;
          updates.push({
            id: childId,
            updates: {
              x: decomposed.translateX,
              y: decomposed.translateY,
              width: actualWidth,
              height: actualHeight,
              rotation: decomposed.angle,
            },
          });

          // Normalise scale on the Fabric object
          child.set({ scaleX: 1, scaleY: 1, width: actualWidth, height: actualHeight });
          child.setCoords();
        }
      }

      if (updates.length > 0) {
        isLocalUpdateRef.current = true;
        log.debug('object:modified ActiveSelection', {
          count: updates.length,
          children: updates.map((u) => ({ id: u.id, ...u.updates })),
        });
        boardRef.current.batchUpdateObjects(updates);
        isLocalUpdateRef.current = false;
      }

      canvas.renderAll();
      return;
    }

    // Single-object modification
    const id = getBoardId(obj);
    if (!id) return;

    delete lastObjectSyncRef.current[id];

    localUpdateIdsRef.current.add(id);
    isLocalUpdateRef.current = true;

    log.debug('object:modified committed', {
      id,
      x: obj.left ?? 0,
      y: obj.top ?? 0,
      angle: obj.angle ?? 0,
      isGroup: obj instanceof Group,
    });

    if (obj instanceof Group) {
      // Sticky notes: position + rotation (fixed-size, no scale normalisation)
      boardRef.current.updateObject(id, {
        x: obj.left ?? 0,
        y: obj.top ?? 0,
        rotation: obj.angle ?? 0,
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
