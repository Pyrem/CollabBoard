import { Canvas as FabricCanvas, Group, ActiveSelection, Textbox, util } from 'fabric';
import type { MutableRefObject, RefObject } from 'react';
import { getObjectSyncThrottle, getAdaptiveThrottleMs, logger } from '@collabboard/shared';
import type { BoardObject, Frame } from '@collabboard/shared';
import type { useBoard } from '../../../hooks/useBoard.js';
import { getBoardId, setBoardId, setFrameContent, createFrameFromData, findByBoardId } from './fabricHelpers.js';

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

    // ActiveSelection: adaptive throttle, preview only the lead object
    if (obj instanceof ActiveSelection) {
      const children = obj.getObjects();
      const lead = children[0];
      if (!lead) return;
      const leadId = getBoardId(lead);
      if (!leadId) return;

      const selectionSize = children.length;
      const now = performance.now();
      const lastSync = lastObjectSyncRef.current[leadId] ?? 0;
      const threshold = getAdaptiveThrottleMs(userCountRef.current, selectionSize);
      const elapsed = now - lastSync;
      if (elapsed < threshold) {
        log.debug('object:moving group skipped', { leadId, selectionSize, elapsed: Math.round(elapsed), threshold });
        return;
      }
      lastObjectSyncRef.current[leadId] = now;

      const worldMatrix = lead.calcTransformMatrix();
      const decomposed = util.qrDecompose(worldMatrix);
      log.debug('object:moving group synced', { leadId, selectionSize, x: decomposed.translateX, y: decomposed.translateY });
      localUpdateIdsRef.current.add(leadId);
      isLocalUpdateRef.current = true;
      boardRef.current.updateObject(leadId, {
        x: decomposed.translateX,
        y: decomposed.translateY,
      });
      isLocalUpdateRef.current = false;
      return;
    }

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

    // When an ActiveSelection is scaled, counteract the group scale on
    // Group children (sticky notes) so they stay fixed-size visually,
    // and preview-broadcast only the lead non-Group child with adaptive throttle.
    if (obj instanceof ActiveSelection) {
      const groupScaleX = obj.scaleX ?? 1;
      const groupScaleY = obj.scaleY ?? 1;
      const children = obj.getObjects();

      // Counteract scale on sticky notes (not frames — frames are resizable)
      for (const child of children) {
        if (child instanceof Group) {
          const childId = getBoardId(child);
          const boardData = childId ? boardRef.current.getObject(childId) : undefined;
          if (boardData?.type !== 'frame') {
            child.set({
              scaleX: 1 / groupScaleX,
              scaleY: 1 / groupScaleY,
            });
          }
        }
      }
      canvas.requestRenderAll();

      // Preview-broadcast the lead non-Group child's dimensions
      const lead = children.find((c) => !(c instanceof Group));
      if (!lead) return;
      const leadId = getBoardId(lead);
      if (!leadId) return;

      const selectionSize = children.length;
      const now = performance.now();
      const lastSync = lastObjectSyncRef.current[leadId] ?? 0;
      const threshold = getAdaptiveThrottleMs(userCountRef.current, selectionSize);
      const elapsed = now - lastSync;
      if (elapsed < threshold) {
        log.debug('object:scaling group skipped', { leadId, selectionSize, elapsed: Math.round(elapsed), threshold });
        return;
      }
      lastObjectSyncRef.current[leadId] = now;

      const worldMatrix = lead.calcTransformMatrix();
      const decomposed = util.qrDecompose(worldMatrix);
      const actualWidth = (lead.width ?? 0) * decomposed.scaleX;
      const actualHeight = (lead.height ?? 0) * decomposed.scaleY;

      log.debug('object:scaling group synced', { leadId, selectionSize, width: Math.round(actualWidth), height: Math.round(actualHeight) });
      localUpdateIdsRef.current.add(leadId);
      isLocalUpdateRef.current = true;
      boardRef.current.updateObject(leadId, {
        x: decomposed.translateX,
        y: decomposed.translateY,
        width: actualWidth,
        height: actualHeight,
      });
      isLocalUpdateRef.current = false;
      return;
    }

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

    // ActiveSelection: adaptive throttle, preview only the lead object's rotation
    if (obj instanceof ActiveSelection) {
      const children = obj.getObjects();
      const lead = children[0];
      if (!lead) return;
      const leadId = getBoardId(lead);
      if (!leadId) return;

      const selectionSize = children.length;
      const now = performance.now();
      const lastSync = lastObjectSyncRef.current[leadId] ?? 0;
      const threshold = getAdaptiveThrottleMs(userCountRef.current, selectionSize);
      const elapsed = now - lastSync;
      if (elapsed < threshold) {
        log.debug('object:rotating group skipped', { leadId, selectionSize, elapsed: Math.round(elapsed), threshold });
        return;
      }
      lastObjectSyncRef.current[leadId] = now;

      const worldMatrix = lead.calcTransformMatrix();
      const decomposed = util.qrDecompose(worldMatrix);
      log.debug('object:rotating group synced', { leadId, selectionSize, angle: Math.round(decomposed.angle) });
      localUpdateIdsRef.current.add(leadId);
      isLocalUpdateRef.current = true;
      boardRef.current.updateObject(leadId, {
        rotation: decomposed.angle,
      });
      isLocalUpdateRef.current = false;
      return;
    }

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
          const boardData = boardRef.current.getObject(childId);
          if (boardData?.type === 'frame') {
            // Frames: resizable — compute actual dimensions from decomposed scale
            const actualWidth = (child.width ?? 0) * decomposed.scaleX;
            const actualHeight = (child.height ?? 0) * decomposed.scaleY;
            child.set({ scaleX: 1, scaleY: 1 });
            child.setCoords();
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
          } else {
            // Sticky notes: position + rotation only (fixed-size).
            // Reset any residual scale from group transform.
            child.set({ scaleX: 1, scaleY: 1 });
            child.setCoords();
            updates.push({
              id: childId,
              updates: {
                x: decomposed.translateX,
                y: decomposed.translateY,
                rotation: decomposed.angle,
              },
            });
          }
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

      // Reconstruct frame Groups that were resized (their internal children
      // need rebuilding after scale normalisation)
      for (const { id: updateId, updates: upd } of updates) {
        if (upd.width !== undefined) {
          const frameData = boardRef.current.getObject(updateId);
          if (frameData?.type === 'frame') {
            const oldObj = findByBoardId(canvas, updateId);
            if (oldObj) {
              canvas.remove(oldObj);
              const newGroup = createFrameFromData(frameData as Frame);
              setBoardId(newGroup, updateId);
              setFrameContent(newGroup, (frameData as Frame).title, (frameData as Frame).fill, frameData.width, frameData.height);
              canvas.add(newGroup);
              canvas.sendObjectToBack(newGroup);
              newGroup.setCoords();
            }
          }
        }
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
      const boardData = boardRef.current.getObject(id);
      if (boardData?.type === 'frame') {
        // Frames are resizable — compute actual dimensions from scale
        const actualWidth = (obj.width ?? 0) * (obj.scaleX ?? 1);
        const actualHeight = (obj.height ?? 0) * (obj.scaleY ?? 1);

        boardRef.current.updateObject(id, {
          x: obj.left ?? 0,
          y: obj.top ?? 0,
          width: actualWidth,
          height: actualHeight,
          rotation: obj.angle ?? 0,
        });

        // Normalise scale and reconstruct the Group
        obj.set({ scaleX: 1, scaleY: 1 });
        obj.setCoords();

        const frameData = boardRef.current.getObject(id);
        if (frameData?.type === 'frame') {
          canvas.remove(obj);
          const newGroup = createFrameFromData(frameData as Frame);
          setBoardId(newGroup, id);
          setFrameContent(newGroup, (frameData as Frame).title, (frameData as Frame).fill, frameData.width, frameData.height);
          canvas.add(newGroup);
          canvas.sendObjectToBack(newGroup);
          newGroup.setCoords();
        }
      } else {
        // Sticky notes: position + rotation (fixed-size, no scale normalisation)
        boardRef.current.updateObject(id, {
          x: obj.left ?? 0,
          y: obj.top ?? 0,
          rotation: obj.angle ?? 0,
        });
      }
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

  // Sync text content to Yjs when the user finishes inline editing a Textbox
  const disposeTextExited = canvas.on('text:editing:exited', (opt) => {
    if (isRemoteUpdateRef.current) return;
    const target = opt.target;
    if (!target || !(target instanceof Textbox)) return;
    const id = getBoardId(target);
    if (!id) return;

    localUpdateIdsRef.current.add(id);
    isLocalUpdateRef.current = true;
    boardRef.current.updateObject(id, {
      text: target.text ?? '',
    } as Partial<BoardObject>);
    isLocalUpdateRef.current = false;
  });

  return () => {
    disposeMoving();
    disposeScaling();
    disposeRotating();
    disposeModified();
    disposeTextExited();
  };
}
