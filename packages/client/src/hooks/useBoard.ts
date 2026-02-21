import { useCallback } from 'react';
import * as Y from 'yjs';
import { v4 as uuidv4 } from 'uuid';
import type {
  BoardObject,
  StickyNote,
  RectangleShape,
  TextElement,
  Frame,
  Connector,
} from '@collabboard/shared';
import {
  DEFAULT_STICKY_COLOR,
  DEFAULT_STICKY_WIDTH,
  DEFAULT_STICKY_HEIGHT,
  DEFAULT_RECT_WIDTH,
  DEFAULT_RECT_HEIGHT,
  DEFAULT_FILL,
  DEFAULT_STROKE,
  DEFAULT_TEXT_FONT_SIZE,
  DEFAULT_TEXT_FILL,
  DEFAULT_TEXT_WIDTH,
  DEFAULT_TEXT_HEIGHT,
  DEFAULT_FRAME_WIDTH,
  DEFAULT_FRAME_HEIGHT,
  DEFAULT_FRAME_FILL,
  DEFAULT_FRAME_TITLE,
  DEFAULT_CONNECTOR_STROKE,
  MAX_OBJECTS_PER_BOARD,
  logger,
} from '@collabboard/shared';

const log = logger('batch');

export interface UseBoardReturn {
  createStickyNote: (x: number, y: number, text?: string, color?: string) => string | null;
  createRectangle: (x: number, y: number, width?: number, height?: number, fill?: string, stroke?: string) => string | null;
  createText: (x: number, y: number, text?: string, fontSize?: number, fill?: string) => string | null;
  createFrame: (x: number, y: number, title?: string, width?: number, height?: number, fill?: string) => string | null;
  createConnector: (fromId: string, toId: string, fromX: number, fromY: number, toX: number, toY: number, stroke?: string) => string | null;
  updateObject: (id: string, updates: Partial<BoardObject>) => void;
  deleteObject: (id: string) => void;
  getObject: (id: string) => BoardObject | undefined;
  getAllObjects: () => BoardObject[];
  getObjectCount: () => number;
  clearAll: () => void;
  batchUpdateObjects: (updates: Array<{ id: string; updates: Partial<BoardObject> }>) => void;
  batchDeleteObjects: (ids: string[]) => void;
  batchCreateObjects: (objects: BoardObject[]) => void;
  addToFrame: (objectId: string, frameId: string) => void;
  removeFromFrame: (objectId: string, frameId: string) => void;
  reparent: (objectId: string, fromFrameId: string | null, toFrameId: string | null) => void;
}

/**
 * CRUD operations for board objects backed by a shared Yjs map.
 *
 * Every mutation writes directly to `objectsMap`, which Yjs syncs to all
 * connected clients automatically. The `userId` is stamped on every write
 * via `lastModifiedBy`.
 *
 * @param objectsMap - The Yjs shared map (`Y.Map<unknown>`) keyed by object UUID.
 *   Pass `null` before the Yjs provider is ready; all operations become no-ops.
 * @param userId - Firebase UID of the current user, recorded on every mutation.
 * @returns Stable callbacks for create / read / update / delete operations.
 *
 * @remarks
 * - Object count is capped at {@link MAX_OBJECTS_PER_BOARD}; create functions
 *   return `null` when the limit is reached.
 * - `clearAll` wraps deletes in a single Yjs transaction so remote clients
 *   receive one batched update.
 */
export function useBoard(
  objectsMap: Y.Map<unknown> | null,
  userId: string,
): UseBoardReturn {
  /**
   * Create a sticky note at the given position.
   * @returns The new object's UUID, or `null` if the map is unavailable or full.
   */
  const createStickyNote = useCallback(
    (x: number, y: number, text = '', color = DEFAULT_STICKY_COLOR): string | null => {
      if (!objectsMap) return null;
      if (objectsMap.size >= MAX_OBJECTS_PER_BOARD) return null;
      const id = uuidv4();
      const note: StickyNote = {
        id,
        type: 'sticky',
        x,
        y,
        width: DEFAULT_STICKY_WIDTH,
        height: DEFAULT_STICKY_HEIGHT,
        rotation: 0,
        zIndex: objectsMap.size,
        lastModifiedBy: userId,
        lastModifiedAt: Date.now(),
        parentId: null,
        text,
        color,
      };
      objectsMap.set(id, note);
      return id;
    },
    [objectsMap, userId],
  );

  /**
   * Create a rectangle shape at the given position.
   * @returns The new object's UUID, or `null` if the map is unavailable or full.
   */
  const createRectangle = useCallback(
    (x: number, y: number, width = DEFAULT_RECT_WIDTH, height = DEFAULT_RECT_HEIGHT, fill = DEFAULT_FILL, stroke = DEFAULT_STROKE): string | null => {
      if (!objectsMap) return null;
      if (objectsMap.size >= MAX_OBJECTS_PER_BOARD) return null;
      const id = uuidv4();
      const rect: RectangleShape = {
        id,
        type: 'rectangle',
        x,
        y,
        width,
        height,
        rotation: 0,
        zIndex: objectsMap.size,
        lastModifiedBy: userId,
        lastModifiedAt: Date.now(),
        parentId: null,
        fill,
        stroke,
      };
      objectsMap.set(id, rect);
      return id;
    },
    [objectsMap, userId],
  );

  /**
   * Create a standalone text element at the given position.
   * @returns The new object's UUID, or `null` if the map is unavailable or full.
   */
  const createText = useCallback(
    (x: number, y: number, text = 'Type here', fontSize = DEFAULT_TEXT_FONT_SIZE, fill = DEFAULT_TEXT_FILL): string | null => {
      if (!objectsMap) return null;
      if (objectsMap.size >= MAX_OBJECTS_PER_BOARD) return null;
      const id = uuidv4();
      const textElement: TextElement = {
        id,
        type: 'text',
        x,
        y,
        width: DEFAULT_TEXT_WIDTH,
        height: DEFAULT_TEXT_HEIGHT,
        rotation: 0,
        zIndex: objectsMap.size,
        lastModifiedBy: userId,
        lastModifiedAt: Date.now(),
        parentId: null,
        text,
        fontSize,
        fill,
      };
      objectsMap.set(id, textElement);
      return id;
    },
    [objectsMap, userId],
  );

  /**
   * Create a frame at the given position.
   * @returns The new object's UUID, or `null` if the map is unavailable or full.
   */
  const createFrame = useCallback(
    (x: number, y: number, title = DEFAULT_FRAME_TITLE, width = DEFAULT_FRAME_WIDTH, height = DEFAULT_FRAME_HEIGHT, fill = DEFAULT_FRAME_FILL): string | null => {
      if (!objectsMap) return null;
      if (objectsMap.size >= MAX_OBJECTS_PER_BOARD) return null;
      const id = uuidv4();
      const frame: Frame = {
        id,
        type: 'frame',
        x,
        y,
        width,
        height,
        rotation: 0,
        zIndex: 0, // Frames render behind everything
        lastModifiedBy: userId,
        lastModifiedAt: Date.now(),
        parentId: null,
        title,
        fill,
        childrenIds: [],
      };
      objectsMap.set(id, frame);
      return id;
    },
    [objectsMap, userId],
  );

  /**
   * Create a connector between two objects.
   *
   * Endpoint coordinates (fromX/Y, toX/Y) are pre-computed by the caller
   * from connection-point helpers. They are stored in `x, y` (from-point)
   * and `width, height` (to-point) — repurposing BaseBoardObject fields.
   *
   * @returns The new connector's UUID, or `null` if the map is unavailable or full.
   */
  const createConnector = useCallback(
    (fromId: string, toId: string, fromX: number, fromY: number, toX: number, toY: number, stroke = DEFAULT_CONNECTOR_STROKE): string | null => {
      if (!objectsMap) return null;
      if (objectsMap.size >= MAX_OBJECTS_PER_BOARD) return null;
      const id = uuidv4();
      const connector: Connector = {
        id,
        type: 'connector',
        x: fromX,
        y: fromY,
        width: toX,   // repurposed: to-point X
        height: toY,  // repurposed: to-point Y
        rotation: 0,
        zIndex: objectsMap.size,
        lastModifiedBy: userId,
        lastModifiedAt: Date.now(),
        parentId: null,
        fromId,
        toId,
        stroke,
        style: 'straight',
      };
      objectsMap.set(id, connector);
      return id;
    },
    [objectsMap, userId],
  );

  /**
   * Merge partial updates into an existing board object.
   * Automatically stamps `lastModifiedBy` and `lastModifiedAt`.
   * No-op if the object doesn't exist.
   */
  const updateObject = useCallback(
    (id: string, updates: Partial<BoardObject>): void => {
      if (!objectsMap) return;
      const existing = objectsMap.get(id) as BoardObject | undefined;
      if (!existing) return;
      objectsMap.set(id, {
        ...existing,
        ...updates,
        lastModifiedBy: userId,
        lastModifiedAt: Date.now(),
      });
    },
    [objectsMap, userId],
  );

  /** Remove a board object by ID. No-op if the map is unavailable. */
  const deleteObject = useCallback(
    (id: string): void => {
      if (!objectsMap) return;
      objectsMap.delete(id);
    },
    [objectsMap],
  );

  /** Look up a single board object by ID. */
  const getObject = useCallback(
    (id: string): BoardObject | undefined => {
      if (!objectsMap) return undefined;
      return objectsMap.get(id) as BoardObject | undefined;
    },
    [objectsMap],
  );

  /** Return all board objects as a plain array (unordered). */
  const getAllObjects = useCallback((): BoardObject[] => {
    if (!objectsMap) return [];
    const objects: BoardObject[] = [];
    objectsMap.forEach((value) => {
      objects.push(value as BoardObject);
    });
    return objects;
  }, [objectsMap]);

  /** Return the current number of objects on the board. */
  const getObjectCount = useCallback((): number => {
    if (!objectsMap) return 0;
    return objectsMap.size;
  }, [objectsMap]);

  /** Delete every object on the board inside a single Yjs transaction. */
  const clearAll = useCallback((): void => {
    if (!objectsMap) return;
    const keys = Array.from(objectsMap.keys());
    objectsMap.doc?.transact(() => {
      for (const key of keys) {
        objectsMap.delete(key);
      }
    });
  }, [objectsMap]);

  /**
   * Update multiple objects in a single Yjs transaction.
   * Collapses N mutations into one WebSocket message.
   */
  const batchUpdateObjects = useCallback(
    (updates: Array<{ id: string; updates: Partial<BoardObject> }>): void => {
      if (!objectsMap) return;
      const doc = objectsMap.doc;
      if (!doc) return;
      log.debug('batchUpdateObjects', { count: updates.length });
      doc.transact(() => {
        for (const { id, updates: partial } of updates) {
          const existing = objectsMap.get(id) as BoardObject | undefined;
          if (!existing) continue;
          objectsMap.set(id, {
            ...existing,
            ...partial,
            lastModifiedBy: userId,
            lastModifiedAt: Date.now(),
          });
        }
      });
    },
    [objectsMap, userId],
  );

  /**
   * Delete multiple objects in a single Yjs transaction.
   * Collapses N deletions into one WebSocket message.
   */
  const batchDeleteObjects = useCallback(
    (ids: string[]): void => {
      if (!objectsMap) return;
      const doc = objectsMap.doc;
      if (!doc) return;
      log.debug('batchDeleteObjects', { count: ids.length });
      doc.transact(() => {
        for (const id of ids) {
          objectsMap.delete(id);
        }
      });
    },
    [objectsMap],
  );

  /**
   * Insert multiple pre-built objects in a single Yjs transaction.
   * Each object must have a unique `id` already assigned.
   * Respects {@link MAX_OBJECTS_PER_BOARD} — stops inserting if the cap is hit.
   */
  const batchCreateObjects = useCallback(
    (objects: BoardObject[]): void => {
      if (!objectsMap) return;
      const doc = objectsMap.doc;
      if (!doc) return;
      log.debug('batchCreateObjects', { count: objects.length });
      doc.transact(() => {
        for (const obj of objects) {
          if (objectsMap.size >= MAX_OBJECTS_PER_BOARD) break;
          objectsMap.set(obj.id, {
            ...obj,
            lastModifiedBy: userId,
            lastModifiedAt: Date.now(),
          });
        }
      });
    },
    [objectsMap, userId],
  );

  /**
   * Add an object as a child of a frame.
   * Sets the child's `parentId` and appends to the frame's `childrenIds`.
   * Frames cannot be children of other frames.
   * Batched in a single Yjs transaction.
   */
  const addToFrame = useCallback(
    (objectId: string, frameId: string): void => {
      if (!objectsMap) return;
      const doc = objectsMap.doc;
      if (!doc) return;
      const child = objectsMap.get(objectId) as BoardObject | undefined;
      const frame = objectsMap.get(frameId) as BoardObject | undefined;
      if (!child || !frame || frame.type !== 'frame') return;
      // Prevent frame nesting
      if (child.type === 'frame') return;
      const frameData = frame as Frame;
      doc.transact(() => {
        objectsMap.set(objectId, {
          ...child,
          parentId: frameId,
          lastModifiedBy: userId,
          lastModifiedAt: Date.now(),
        });
        objectsMap.set(frameId, {
          ...frameData,
          childrenIds: [...frameData.childrenIds, objectId],
          lastModifiedBy: userId,
          lastModifiedAt: Date.now(),
        });
      });
    },
    [objectsMap, userId],
  );

  /**
   * Remove an object from a frame.
   * Clears the child's `parentId` and removes from the frame's `childrenIds`.
   * Batched in a single Yjs transaction.
   */
  const removeFromFrame = useCallback(
    (objectId: string, frameId: string): void => {
      if (!objectsMap) return;
      const doc = objectsMap.doc;
      if (!doc) return;
      const child = objectsMap.get(objectId) as BoardObject | undefined;
      const frame = objectsMap.get(frameId) as BoardObject | undefined;
      if (!child || !frame || frame.type !== 'frame') return;
      const frameData = frame as Frame;
      doc.transact(() => {
        objectsMap.set(objectId, {
          ...child,
          parentId: null,
          lastModifiedBy: userId,
          lastModifiedAt: Date.now(),
        });
        objectsMap.set(frameId, {
          ...frameData,
          childrenIds: frameData.childrenIds.filter((id) => id !== objectId),
          lastModifiedBy: userId,
          lastModifiedAt: Date.now(),
        });
      });
    },
    [objectsMap, userId],
  );

  /**
   * Move an object from one frame to another (or to/from top-level).
   * Handles all four cases: join, leave, switch, or no-op.
   * Batched in a single Yjs transaction.
   */
  const reparent = useCallback(
    (objectId: string, fromFrameId: string | null, toFrameId: string | null): void => {
      if (!objectsMap) return;
      if (fromFrameId === toFrameId) return;
      const doc = objectsMap.doc;
      if (!doc) return;
      const child = objectsMap.get(objectId) as BoardObject | undefined;
      if (!child) return;
      // Prevent frame nesting
      if (child.type === 'frame') return;

      doc.transact(() => {
        // Remove from old frame
        if (fromFrameId) {
          const oldFrame = objectsMap.get(fromFrameId) as BoardObject | undefined;
          if (oldFrame?.type === 'frame') {
            const oldFrameData = oldFrame as Frame;
            objectsMap.set(fromFrameId, {
              ...oldFrameData,
              childrenIds: oldFrameData.childrenIds.filter((id) => id !== objectId),
              lastModifiedBy: userId,
              lastModifiedAt: Date.now(),
            });
          }
        }
        // Add to new frame
        if (toFrameId) {
          const newFrame = objectsMap.get(toFrameId) as BoardObject | undefined;
          if (newFrame?.type === 'frame') {
            const newFrameData = newFrame as Frame;
            objectsMap.set(toFrameId, {
              ...newFrameData,
              childrenIds: [...newFrameData.childrenIds, objectId],
              lastModifiedBy: userId,
              lastModifiedAt: Date.now(),
            });
          }
        }
        // Update child's parentId
        objectsMap.set(objectId, {
          ...child,
          parentId: toFrameId,
          lastModifiedBy: userId,
          lastModifiedAt: Date.now(),
        });
      });
    },
    [objectsMap, userId],
  );

  return {
    createStickyNote,
    createRectangle,
    createText,
    createFrame,
    createConnector,
    updateObject,
    deleteObject,
    getObject,
    getAllObjects,
    getObjectCount,
    clearAll,
    batchUpdateObjects,
    batchDeleteObjects,
    batchCreateObjects,
    addToFrame,
    removeFromFrame,
    reparent,
  };
}
