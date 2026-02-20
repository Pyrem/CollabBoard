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
} from '@collabboard/shared';

interface UseBoardReturn {
  createStickyNote: (x: number, y: number, text?: string, color?: string) => string | null;
  createRectangle: (x: number, y: number, width?: number, height?: number, fill?: string, stroke?: string) => string | null;
  updateObject: (id: string, updates: Partial<BoardObject>) => void;
  deleteObject: (id: string) => void;
  getObject: (id: string) => BoardObject | undefined;
  getAllObjects: () => BoardObject[];
  getObjectCount: () => number;
  clearAll: () => void;
}

export function useBoard(
  objectsMap: Y.Map<unknown> | null,
  userId: string,
): UseBoardReturn {
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

  const deleteObject = useCallback(
    (id: string): void => {
      if (!objectsMap) return;
      objectsMap.delete(id);
    },
    [objectsMap],
  );

  const getObject = useCallback(
    (id: string): BoardObject | undefined => {
      if (!objectsMap) return undefined;
      return objectsMap.get(id) as BoardObject | undefined;
    },
    [objectsMap],
  );

  const getAllObjects = useCallback((): BoardObject[] => {
    if (!objectsMap) return [];
    const objects: BoardObject[] = [];
    objectsMap.forEach((value) => {
      objects.push(value as BoardObject);
    });
    return objects;
  }, [objectsMap]);

  const getObjectCount = useCallback((): number => {
    if (!objectsMap) return 0;
    return objectsMap.size;
  }, [objectsMap]);

  const clearAll = useCallback((): void => {
    if (!objectsMap) return;
    const keys = Array.from(objectsMap.keys());
    objectsMap.doc?.transact(() => {
      for (const key of keys) {
        objectsMap.delete(key);
      }
    });
  }, [objectsMap]);

  return { createStickyNote, createRectangle, updateObject, deleteObject, getObject, getAllObjects, getObjectCount, clearAll };
}
