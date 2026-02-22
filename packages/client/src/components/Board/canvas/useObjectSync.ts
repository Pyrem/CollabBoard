import { useEffect, type MutableRefObject } from 'react';
import {
  Canvas as FabricCanvas,
  Rect,
  Textbox,
  Line,
} from 'fabric';
import type * as Y from 'yjs';
import type { BoardObject, StickyNote, RectangleShape, TextElement, Frame, Connector } from '@collabboard/shared';
import { validateBoardObject } from '@collabboard/shared';
import {
  getBoardId,
  setBoardId,
  getStickyContent,
  setStickyContent,
  createStickyGroup,
  createRectFromData,
  updateRectFromData,
  createTextFromData,
  updateTextFromData,
  getFrameContent,
  setFrameContent,
  createFrameFromData,
  createConnectorLine,
  updateConnectorLine,
  findByBoardId,
  getNearestPorts,
} from './fabricHelpers.js';

/**
 * React hook that keeps the Fabric canvas in sync with the Yjs objects map.
 *
 * On mount (or when `objectsMap` changes) it:
 * 1. Performs an initial load — reads every object from the Yjs map, validates
 *    it, sorts by `zIndex`, and renders it to the canvas.
 * 2. Registers a Yjs `observe` callback that processes add/update/delete
 *    events and applies them to the canvas in real time.
 *
 * **Adding a new object type** requires only:
 * - A `create*FromData` / `update*FromData` function in `fabricHelpers.ts`
 * - A new `case` in the `syncObjectToCanvas` switch below
 *
 * @param fabricRef       - Ref to the Fabric canvas instance (null before mount)
 * @param objectsMap      - The Yjs shared map (`Y.Map('objects')`)
 * @param isRemoteUpdateRef  - Flag set `true` while applying remote changes to
 *   Fabric, so that local-modification handlers can skip the echo.
 * @param isLocalUpdateRef   - Flag set `true` while local Fabric events are
 *   being forwarded to Yjs, so that the observer can skip the echo.
 * @param localUpdateIdsRef  - Per-object set of IDs whose most-recent Yjs
 *   write came from the local user. Cleared on first observer hit.
 */
export function useObjectSync(
  fabricRef: MutableRefObject<FabricCanvas | null>,
  objectsMap: Y.Map<unknown>,
  isRemoteUpdateRef: MutableRefObject<boolean>,
  isLocalUpdateRef: MutableRefObject<boolean>,
  localUpdateIdsRef: MutableRefObject<Set<string>>,
): void {
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    /**
     * Reposition all connector Lines on canvas whose start.id or end.id matches
     * the given object ID. Called after a non-connector object is synced so
     * that remote clients see connectors follow their connected objects.
     */
    const refreshConnectorsFor = (objectId: string): void => {
      objectsMap.forEach((raw, key) => {
        const obj = validateBoardObject(raw);
        if (!obj || obj.type !== 'connector') return;
        const conn = obj as Connector;
        if (conn.start.id !== objectId && conn.end.id !== objectId) return;

        const lineObj = findByBoardId(canvas, key);
        if (!lineObj || !(lineObj instanceof Line)) return;

        const fromObj = findByBoardId(canvas, conn.start.id);
        const toObj = findByBoardId(canvas, conn.end.id);
        if (!fromObj || !toObj) return;

        const ports = getNearestPorts(fromObj, toObj);
        updateConnectorLine(lineObj, ports.from.x, ports.from.y, ports.to.x, ports.to.y);
      });
    };

    /**
     * Create or update a single Fabric object from a validated {@link BoardObject}.
     *
     * For sticky notes a position-only change does a lightweight `set`/`setCoords`;
     * a text or color change recreates the entire `Group` (Fabric limitation).
     * Rectangles are updated in-place via {@link updateRectFromData}.
     *
     * Skipped entirely when the change originated locally (prevents echo loops).
     */
    const syncObjectToCanvas = (id: string, data: BoardObject): void => {
      if (isLocalUpdateRef.current || localUpdateIdsRef.current.delete(id)) return;

      isRemoteUpdateRef.current = true;
      const existing = findByBoardId(canvas, id);

      if (existing) {
        switch (data.type) {
          case 'sticky': {
            const stickyData = data as StickyNote;
            const prev = getStickyContent(existing);

            if (prev && prev.text === stickyData.text && prev.color === stickyData.color) {
              // Position/rotation-only change — lightweight update
              existing.set({ left: stickyData.x, top: stickyData.y, angle: stickyData.rotation });
              existing.setCoords();
            } else {
              // Content changed — must recreate the Group (Fabric limitation)
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
            break;
          }
          case 'rectangle': {
            if (existing instanceof Rect) {
              updateRectFromData(existing, data as RectangleShape);
            }
            break;
          }
          case 'text': {
            if (existing instanceof Textbox) {
              // Skip update if the local user is actively editing this text element
              if (!existing.isEditing) {
                updateTextFromData(existing, data as TextElement);
              }
            }
            break;
          }
          case 'frame': {
            const frameData = data as Frame;
            const prev = getFrameContent(existing);

            // Detect position change for child propagation
            const oldLeft = existing.left ?? 0;
            const oldTop = existing.top ?? 0;
            const deltaX = frameData.x - oldLeft;
            const deltaY = frameData.y - oldTop;

            if (prev && prev.title === frameData.title && prev.fill === frameData.fill &&
                prev.width === frameData.width && prev.height === frameData.height) {
              // Position-only change — lightweight update
              existing.set({ left: frameData.x, top: frameData.y, angle: frameData.rotation });
              existing.setCoords();
            } else {
              // Content or size changed — recreate the Group
              const wasActive = canvas.getActiveObject() === existing;
              canvas.remove(existing);
              const group = createFrameFromData(frameData);
              setBoardId(group, id);
              setFrameContent(group, frameData.title, frameData.fill, frameData.width, frameData.height);
              canvas.add(group);
              canvas.sendObjectToBack(group);
              group.setCoords();
              if (wasActive) {
                canvas.setActiveObject(group);
              }
            }

            // Propagate frame movement to children on canvas.
            // During a remote drag, only the frame position is synced per tick;
            // children positions arrive on drop. Moving them here keeps them
            // visually attached while the remote user is still dragging.
            if ((deltaX !== 0 || deltaY !== 0) && frameData.childrenIds.length > 0) {
              for (const childId of frameData.childrenIds) {
                const childFab = findByBoardId(canvas, childId);
                if (!childFab) continue;
                childFab.set({
                  left: (childFab.left ?? 0) + deltaX,
                  top: (childFab.top ?? 0) + deltaY,
                });
                childFab.setCoords();
                refreshConnectorsFor(childId);
              }
            }
            break;
          }
          case 'connector': {
            const connData = data as Connector;
            if (existing instanceof Line) {
              updateConnectorLine(existing, connData.x, connData.y, connData.width, connData.height, connData.stroke);
            }
            break;
          }
          // Future object types go here:
          // case 'circle': { ... break; }
          // case 'line': { ... break; }
          default:
            // Unhandled type — log and skip so we don't crash on unknown data
            console.warn(`[useObjectSync] Unhandled object type for update: "${data.type}"`);
        }
        // After updating a non-connector object, reposition any connectors
        // attached to it so remote clients see connectors follow.
        if (data.type !== 'connector') {
          refreshConnectorsFor(id);
        }
        canvas.renderAll();
      } else {
        // Object doesn't exist on canvas yet — create it
        switch (data.type) {
          case 'sticky': {
            const stickyData = data as StickyNote;
            const group = createStickyGroup(stickyData);
            setBoardId(group, id);
            setStickyContent(group, stickyData.text, stickyData.color);
            canvas.add(group);
            group.setCoords();
            break;
          }
          case 'rectangle': {
            const rect = createRectFromData(data as RectangleShape);
            canvas.add(rect);
            rect.setCoords();
            break;
          }
          case 'text': {
            const textbox = createTextFromData(data as TextElement);
            canvas.add(textbox);
            textbox.setCoords();
            break;
          }
          case 'frame': {
            const frameData = data as Frame;
            const group = createFrameFromData(frameData);
            setBoardId(group, id);
            setFrameContent(group, frameData.title, frameData.fill, frameData.width, frameData.height);
            canvas.add(group);
            canvas.sendObjectToBack(group);
            group.setCoords();
            break;
          }
          case 'connector': {
            const connData = data as Connector;
            // If stored endpoints are zero, try to compute from connected objects
            let x1 = connData.x;
            let y1 = connData.y;
            let x2 = connData.width;
            let y2 = connData.height;
            if (x1 === 0 && y1 === 0 && x2 === 0 && y2 === 0) {
              const fromObj = findByBoardId(canvas, connData.start.id);
              const toObj = findByBoardId(canvas, connData.end.id);
              if (fromObj && toObj) {
                const ports = getNearestPorts(fromObj, toObj);
                x1 = ports.from.x;
                y1 = ports.from.y;
                x2 = ports.to.x;
                y2 = ports.to.y;
              }
            }
            const adjusted: Connector = { ...connData, x: x1, y: y1, width: x2, height: y2 };
            const line = createConnectorLine(adjusted);
            canvas.add(line);
            line.setCoords();
            break;
          }
          // Future object types go here:
          // case 'circle': { ... break; }
          // case 'line': { ... break; }
          default:
            console.warn(`[useObjectSync] Unhandled object type for create: "${data.type}"`);
        }
        canvas.renderAll();
      }
      isRemoteUpdateRef.current = false;
    };

    /**
     * Remove all Fabric objects matching the given board ID.
     *
     * Iterates all canvas objects (rather than just `findByBoardId`) to handle
     * potential duplicates left by rapid add/remove sequences.
     */
    const removeObjectFromCanvas = (id: string): void => {
      isRemoteUpdateRef.current = true;
      const toRemove = canvas.getObjects().filter((obj) => getBoardId(obj) === id);
      toRemove.forEach((obj) => canvas.remove(obj));
      canvas.renderAll();
      isRemoteUpdateRef.current = false;
    };

    // --- Initial load: read all existing objects from Yjs and render them ---
    const objects: Array<[string, BoardObject]> = [];
    objectsMap.forEach((value, key) => {
      const validated = validateBoardObject(value);
      if (validated) {
        objects.push([key, validated]);
      } else {
        console.warn(`[useObjectSync] Ignoring malformed object "${key}"`, value);
      }
    });
    objects.sort((a, b) => a[1].zIndex - b[1].zIndex);
    objects.forEach(([key, data]) => syncObjectToCanvas(key, data));

    // --- Live observer: process add/update/delete events from Yjs ---
    const observer = (events: Y.YMapEvent<unknown>): void => {
      events.changes.keys.forEach((change, key) => {
        if (change.action === 'add' || change.action === 'update') {
          const raw = objectsMap.get(key);
          const data = validateBoardObject(raw);
          if (data) {
            syncObjectToCanvas(key, data);
          } else {
            console.warn(`[useObjectSync] Ignoring malformed object "${key}"`, raw);
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
    // fabricRef is a stable ref; the remaining refs are also stable.
    // Only objectsMap triggers re-subscription (e.g. when switching boards).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectsMap]);
}
