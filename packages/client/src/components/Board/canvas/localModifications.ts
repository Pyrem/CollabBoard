import { Canvas as FabricCanvas, Group, ActiveSelection, Textbox, Line, util } from 'fabric';
import type { MutableRefObject, RefObject } from 'react';
import { getObjectSyncThrottle, getAdaptiveThrottleMs, logger } from '@collabboard/shared';
import type { BoardObject, Frame, Connector } from '@collabboard/shared';
import type { useBoard } from '../../../hooks/useBoard.js';
import { getBoardId, setBoardId, setFrameContent, createFrameFromData, findByBoardId, getNearestPorts, updateConnectorLine } from './fabricHelpers.js';
import { findContainingFrame, findEvictedChildren, getAllFrames, getFrameBounds, isInsideFrame } from './containment.js';

const log = logger('throttle');
const containmentLog = logger('containment');

/** Stroke color/width used to highlight a frame when an object is dragged over it. */
const FRAME_HIGHLIGHT_STROKE = '#2196F3';
const FRAME_HIGHLIGHT_STROKE_WIDTH = 3;
const FRAME_NORMAL_STROKE = '#999';
const FRAME_NORMAL_STROKE_WIDTH = 2;

/**
 * Reposition all Fabric Line connectors attached to a given object.
 *
 * When `writeToYjs` is true the updated endpoint coordinates are also
 * persisted to the Yjs map so remote clients receive the change.
 * When false, only the local Fabric canvas is updated (used during
 * object:moving for smooth visual feedback without Yjs traffic).
 */
function repositionConnectors(
  canvas: FabricCanvas,
  boardRef: RefObject<ReturnType<typeof useBoard>>,
  objectId: string,
  writeToYjs: boolean,
  isLocalUpdateRef?: MutableRefObject<boolean>,
  localUpdateIdsRef?: MutableRefObject<Set<string>>,
): void {
  const allObjects = boardRef.current.getAllObjects();

  for (const obj of allObjects) {
    if (obj.type !== 'connector') continue;
    const conn = obj as Connector;
    if (!conn.start || !conn.end) continue;
    if (conn.start.id !== objectId && conn.end.id !== objectId) continue;

    const fromFab = findByBoardId(canvas, conn.start.id);
    const toFab = findByBoardId(canvas, conn.end.id);
    if (!fromFab || !toFab) continue;

    const ports = getNearestPorts(fromFab, toFab);

    // Update Fabric Line directly
    const lineObj = findByBoardId(canvas, conn.id);
    if (lineObj && lineObj instanceof Line) {
      updateConnectorLine(lineObj, ports.from.x, ports.from.y, ports.to.x, ports.to.y);
    }

    // Persist to Yjs for remote sync
    if (writeToYjs) {
      if (localUpdateIdsRef) localUpdateIdsRef.current.add(conn.id);
      if (isLocalUpdateRef) isLocalUpdateRef.current = true;
      boardRef.current.updateObject(conn.id, {
        x: ports.from.x,
        y: ports.from.y,
        width: ports.to.x,
        height: ports.to.y,
      });
      if (isLocalUpdateRef) isLocalUpdateRef.current = false;
    }
  }
}

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
  // --- Frame-child drag tracking state ---
  // Previous frame position during drag, for computing incremental deltas.
  const framePrevPos: Record<string, { x: number; y: number }> = {};
  // Currently highlighted frame (for visual feedback when dragging into a frame).
  let highlightedFrameId: string | null = null;

  /**
   * Move all children of a frame on the local Fabric canvas by a delta.
   * Visual-only (no Yjs writes). Also repositions connectors attached to children.
   */
  function moveFrameChildrenOnCanvas(
    frameData: Frame,
    deltaX: number,
    deltaY: number,
    writeToYjs: boolean,
  ): void {
    for (const childId of frameData.childrenIds) {
      const childFab = findByBoardId(canvas, childId);
      if (!childFab) continue;
      childFab.set({
        left: (childFab.left ?? 0) + deltaX,
        top: (childFab.top ?? 0) + deltaY,
      });
      childFab.setCoords();
      repositionConnectors(canvas, boardRef, childId, writeToYjs,
        writeToYjs ? isLocalUpdateRef : undefined,
        writeToYjs ? localUpdateIdsRef : undefined);
    }
  }

  /**
   * Reset any active frame highlight back to normal styling.
   */
  function clearFrameHighlight(): void {
    if (!highlightedFrameId) return;
    const frameFab = findByBoardId(canvas, highlightedFrameId);
    if (frameFab && frameFab instanceof Group) {
      const bg = frameFab.getObjects()[0];
      if (bg) {
        bg.set({ stroke: FRAME_NORMAL_STROKE, strokeWidth: FRAME_NORMAL_STROKE_WIDTH });
        frameFab.dirty = true;
      }
    }
    highlightedFrameId = null;
  }

  /**
   * Highlight a frame's border to show it will accept a dropped object.
   */
  function setFrameHighlight(frameId: string): void {
    if (highlightedFrameId === frameId) return;
    clearFrameHighlight();
    const frameFab = findByBoardId(canvas, frameId);
    if (frameFab && frameFab instanceof Group) {
      const bg = frameFab.getObjects()[0];
      if (bg) {
        bg.set({ stroke: FRAME_HIGHLIGHT_STROKE, strokeWidth: FRAME_HIGHLIGHT_STROKE_WIDTH });
        frameFab.dirty = true;
      }
    }
    highlightedFrameId = frameId;
  }

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

    // Update connected connectors visually (no Yjs write during drag)
    repositionConnectors(canvas, boardRef, id, false);

    // Frame-specific: move children on canvas during drag
    const boardData = boardRef.current.getObject(id);
    if (boardData?.type === 'frame') {
      const frameX = obj.left ?? 0;
      const frameY = obj.top ?? 0;
      if (!framePrevPos[id]) {
        // First move event — seed from the Yjs data (position before drag)
        framePrevPos[id] = { x: boardData.x, y: boardData.y };
      }
      const prev = framePrevPos[id];
      const deltaX = frameX - prev.x;
      const deltaY = frameY - prev.y;
      if (deltaX !== 0 || deltaY !== 0) {
        moveFrameChildrenOnCanvas(boardData as Frame, deltaX, deltaY, false);
        framePrevPos[id] = { x: frameX, y: frameY };
      }
    }

    // Non-frame: visual highlight if dragging over a frame
    if (boardData && boardData.type !== 'frame') {
      // Compute actual center (left/top is top-left corner in Fabric)
      const objCenterX = (obj.left ?? 0) + (obj.width ?? 0) / 2;
      const objCenterY = (obj.top ?? 0) + (obj.height ?? 0) / 2;
      const frames = getAllFrames(boardRef.current.getAllObjects());
      const containingFrame = findContainingFrame(objCenterX, objCenterY, frames);
      if (containingFrame) {
        setFrameHighlight(containingFrame.id);
      } else {
        clearFrameHighlight();
      }
    }
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

      // Update connected connectors for all modified objects
      for (const { id: updateId } of updates) {
        repositionConnectors(canvas, boardRef, updateId, true, isLocalUpdateRef, localUpdateIdsRef);
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
        const wasResized = Math.abs((obj.scaleX ?? 1) - 1) > 0.001 || Math.abs((obj.scaleY ?? 1) - 1) > 0.001;

        containmentLog.debug('frame modified', {
          frameId: id,
          wasResized,
          fabricObj: {
            left: obj.left,
            top: obj.top,
            width: obj.width,
            height: obj.height,
            scaleX: obj.scaleX,
            scaleY: obj.scaleY,
          },
          yjsBefore: {
            x: boardData.x,
            y: boardData.y,
            width: boardData.width,
            height: boardData.height,
            childrenIds: (boardData as Frame).childrenIds,
          },
        });

        if (wasResized) {
          // Frames are resizable — compute actual dimensions from scale
          const actualWidth = (obj.width ?? 0) * (obj.scaleX ?? 1);
          const actualHeight = (obj.height ?? 0) * (obj.scaleY ?? 1);

          containmentLog.debug('frame resize computed', {
            frameId: id,
            objWidth: obj.width,
            objHeight: obj.height,
            scaleX: obj.scaleX,
            scaleY: obj.scaleY,
            actualWidth,
            actualHeight,
            newPos: { x: obj.left ?? 0, y: obj.top ?? 0 },
          });

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
            containmentLog.debug('frame after Yjs write', {
              frameId: id,
              yjsAfter: {
                x: frameData.x,
                y: frameData.y,
                width: frameData.width,
                height: frameData.height,
                childrenIds: (frameData as Frame).childrenIds,
              },
              bounds: {
                left: frameData.x,
                top: frameData.y,
                right: frameData.x + frameData.width,
                bottom: frameData.y + frameData.height,
              },
            });

            canvas.remove(obj);
            const newGroup = createFrameFromData(frameData as Frame);
            setBoardId(newGroup, id);
            setFrameContent(newGroup, (frameData as Frame).title, (frameData as Frame).fill, frameData.width, frameData.height);
            canvas.add(newGroup);
            canvas.sendObjectToBack(newGroup);
            newGroup.setCoords();

            // Evict children whose centers are now outside the resized frame
            const allObjects = boardRef.current.getAllObjects();
            const children = allObjects.filter((o) => o.parentId === id);
            containmentLog.debug('eviction check', {
              frameId: id,
              frameBounds: {
                left: frameData.x,
                top: frameData.y,
                right: frameData.x + frameData.width,
                bottom: frameData.y + frameData.height,
              },
              children: children.map((c) => ({
                id: c.id,
                type: c.type,
                pos: { x: c.x, y: c.y, w: c.width, h: c.height },
                center: { x: c.x + c.width / 2, y: c.y + c.height / 2 },
                insideFrame: (c.x + c.width / 2) >= frameData.x &&
                  (c.x + c.width / 2) <= frameData.x + frameData.width &&
                  (c.y + c.height / 2) >= frameData.y &&
                  (c.y + c.height / 2) <= frameData.y + frameData.height,
              })),
            });

            const evicted = findEvictedChildren(frameData as Frame, allObjects);
            containmentLog.debug('eviction result', {
              frameId: id,
              evictedIds: evicted,
              evictedCount: evicted.length,
            });
            for (const childId of evicted) {
              localUpdateIdsRef.current.add(childId);
              localUpdateIdsRef.current.add(id);
              boardRef.current.removeFromFrame(childId, id);
            }
          }
        } else {
          // Position-only change (frames don't rotate) — batch-commit children positions
          const frame = boardData as Frame;
          const deltaX = (obj.left ?? 0) - boardData.x;
          const deltaY = (obj.top ?? 0) - boardData.y;

          containmentLog.debug('frame move commit', {
            frameId: id,
            from: { x: boardData.x, y: boardData.y },
            to: { x: obj.left ?? 0, y: obj.top ?? 0 },
            delta: { x: deltaX, y: deltaY },
            childrenIds: frame.childrenIds,
          });

          // Build batch: frame position + all children from their Fabric positions
          const updates: Array<{ id: string; updates: Partial<BoardObject> }> = [
            { id, updates: { x: obj.left ?? 0, y: obj.top ?? 0 } },
          ];
          for (const childId of frame.childrenIds) {
            const childFab = findByBoardId(canvas, childId);
            if (!childFab) continue;
            localUpdateIdsRef.current.add(childId);
            updates.push({
              id: childId,
              updates: { x: childFab.left ?? 0, y: childFab.top ?? 0 },
            });
          }
          boardRef.current.batchUpdateObjects(updates);

          // Reposition connectors for all moved children
          for (const childId of frame.childrenIds) {
            repositionConnectors(canvas, boardRef, childId, true, isLocalUpdateRef, localUpdateIdsRef);
          }
        }
        // Clean up drag tracking
        delete framePrevPos[id];
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

    // Update connected connectors with Yjs write for remote sync
    repositionConnectors(canvas, boardRef, id, true, isLocalUpdateRef, localUpdateIdsRef);

    // Containment check: only non-frame objects can join/leave frames on drop
    const droppedData = boardRef.current.getObject(id);
    containmentLog.debug('drop check', {
      id,
      type: droppedData?.type,
      eligible: droppedData ? droppedData.type !== 'frame' && droppedData.type !== 'connector' : false,
      dataExists: !!droppedData,
    });
    if (droppedData && droppedData.type !== 'frame' && droppedData.type !== 'connector') {
      clearFrameHighlight();
      // Compute actual center (x/y is top-left corner in Fabric)
      const objCenterX = droppedData.x + droppedData.width / 2;
      const objCenterY = droppedData.y + droppedData.height / 2;
      const frames = getAllFrames(boardRef.current.getAllObjects());
      const containingFrame = findContainingFrame(objCenterX, objCenterY, frames);
      const currentParentId = droppedData.parentId ?? null;
      const newParentId = containingFrame?.id ?? null;

      containmentLog.debug('center & frame test', {
        id,
        objPos: { x: droppedData.x, y: droppedData.y, w: droppedData.width, h: droppedData.height },
        center: { x: objCenterX, y: objCenterY },
        frameCount: frames.length,
        frames: frames.map((f) => ({
          id: f.id,
          bounds: { left: f.x, top: f.y, right: f.x + f.width, bottom: f.y + f.height },
        })),
        containingFrameId: containingFrame?.id ?? null,
        currentParentId,
        newParentId,
        willReparent: currentParentId !== newParentId,
      });

      if (currentParentId !== newParentId) {
        containmentLog.debug('reparent', { id, from: currentParentId, to: newParentId });
        isLocalUpdateRef.current = true;
        localUpdateIdsRef.current.add(id);
        if (currentParentId) localUpdateIdsRef.current.add(currentParentId);
        if (newParentId) localUpdateIdsRef.current.add(newParentId);
        boardRef.current.reparent(id, currentParentId, newParentId);
        isLocalUpdateRef.current = false;
      }
    }

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
