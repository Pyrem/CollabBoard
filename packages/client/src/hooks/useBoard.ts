import { useCallback } from 'react';
import * as Y from 'yjs';
import { v4 as uuidv4 } from 'uuid';
import type {
  BoardObject,
  StickyNote,
  RectangleShape,
} from '@collabboard/shared';
import {
  DEFAULT_STICKY_COLOR,
  DEFAULT_STICKY_WIDTH,
  DEFAULT_STICKY_HEIGHT,
  DEFAULT_RECT_WIDTH,
  DEFAULT_RECT_HEIGHT,
  DEFAULT_FILL,
  DEFAULT_STROKE,
  MAX_OBJECTS_PER_BOARD,
  logger,
} from '@collabboard/shared';

const log = logger('batch');

export interface UseBoardReturn {
  createStickyNote: (x: number, y: number, text?: string, color?: string) => string | null;
  createRectangle: (x: number, y: number, width?: number, height?: number, fill?: string, stroke?: string) => string | null;
  updateObject: (id: string, updates: Partial<BoardObject>) => void;
  deleteObject: (id: string) => void;
  getObject: (id: string) => BoardObject | undefined;
  getAllObjects: () => BoardObject[];
  getObjectCount: () => number;
  clearAll: () => void;
  batchUpdateObjects: (updates: Array<{ id: string; updates: Partial<BoardObject> }>) => void;
  batchDeleteObjects: (ids: string[]) => void;
  batchCreateObjects: (objects: BoardObject[]) => void;
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
        fill,
        stroke,
      };
      objectsMap.set(id, rect);
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

  return {
    createStickyNote,
    createRectangle,
    updateObject,
    deleteObject,
    getObject,
    getAllObjects,
    getObjectCount,
    clearAll,
    batchUpdateObjects,
    batchDeleteObjects,
    batchCreateObjects,
  };
}
