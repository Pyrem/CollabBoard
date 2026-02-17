import { describe, it, expect, beforeEach } from 'vitest';
import * as Y from 'yjs';
import type { BoardObject, StickyNote, RectangleShape } from '@collabboard/shared';
import {
  DEFAULT_STICKY_COLOR,
  DEFAULT_STICKY_WIDTH,
  DEFAULT_STICKY_HEIGHT,
  DEFAULT_RECT_WIDTH,
  DEFAULT_RECT_HEIGHT,
  DEFAULT_FILL,
  DEFAULT_STROKE,
} from '@collabboard/shared';

/**
 * Tests for board CRUD operations against real Yjs Y.Doc instances.
 * These test the same logic that useBoard wraps with useCallback.
 */

let doc: Y.Doc;
let objectsMap: Y.Map<unknown>;
const userId = 'test-user-123';

function createStickyNote(
  map: Y.Map<unknown>,
  x: number,
  y: number,
  text = '',
  color = DEFAULT_STICKY_COLOR,
): string {
  const id = crypto.randomUUID();
  const note: StickyNote = {
    id,
    type: 'sticky',
    x,
    y,
    width: DEFAULT_STICKY_WIDTH,
    height: DEFAULT_STICKY_HEIGHT,
    rotation: 0,
    zIndex: map.size,
    lastModifiedBy: userId,
    lastModifiedAt: Date.now(),
    text,
    color,
  };
  map.set(id, note);
  return id;
}

function createRectangle(
  map: Y.Map<unknown>,
  x: number,
  y: number,
  width = DEFAULT_RECT_WIDTH,
  height = DEFAULT_RECT_HEIGHT,
): string {
  const id = crypto.randomUUID();
  const rect: RectangleShape = {
    id,
    type: 'rectangle',
    x,
    y,
    width,
    height,
    rotation: 0,
    zIndex: map.size,
    lastModifiedBy: userId,
    lastModifiedAt: Date.now(),
    fill: DEFAULT_FILL,
    stroke: DEFAULT_STROKE,
  };
  map.set(id, rect);
  return id;
}

function updateObject(map: Y.Map<unknown>, id: string, updates: Partial<BoardObject>): void {
  const existing = map.get(id) as BoardObject | undefined;
  if (!existing) return;
  map.set(id, {
    ...existing,
    ...updates,
    lastModifiedBy: userId,
    lastModifiedAt: Date.now(),
  });
}

function deleteObject(map: Y.Map<unknown>, id: string): void {
  map.delete(id);
}

describe('Board CRUD operations', () => {
  beforeEach(() => {
    doc = new Y.Doc();
    objectsMap = doc.getMap('objects');
  });

  describe('createStickyNote', () => {
    it('creates a sticky note with correct defaults', () => {
      const id = createStickyNote(objectsMap, 100, 200);
      const obj = objectsMap.get(id) as StickyNote;

      expect(obj).toBeDefined();
      expect(obj.type).toBe('sticky');
      expect(obj.x).toBe(100);
      expect(obj.y).toBe(200);
      expect(obj.width).toBe(DEFAULT_STICKY_WIDTH);
      expect(obj.height).toBe(DEFAULT_STICKY_HEIGHT);
      expect(obj.color).toBe(DEFAULT_STICKY_COLOR);
      expect(obj.text).toBe('');
      expect(obj.rotation).toBe(0);
      expect(obj.lastModifiedBy).toBe(userId);
    });

    it('creates a sticky note with custom text and color', () => {
      const id = createStickyNote(objectsMap, 50, 50, 'Hello world', '#FF9800');
      const obj = objectsMap.get(id) as StickyNote;

      expect(obj.text).toBe('Hello world');
      expect(obj.color).toBe('#FF9800');
    });

    it('increments zIndex for each new object', () => {
      const id1 = createStickyNote(objectsMap, 0, 0);
      const id2 = createStickyNote(objectsMap, 100, 100);

      const obj1 = objectsMap.get(id1) as StickyNote;
      const obj2 = objectsMap.get(id2) as StickyNote;

      expect(obj1.zIndex).toBe(0);
      expect(obj2.zIndex).toBe(1);
    });
  });

  describe('createRectangle', () => {
    it('creates a rectangle with correct defaults', () => {
      const id = createRectangle(objectsMap, 300, 400);
      const obj = objectsMap.get(id) as RectangleShape;

      expect(obj).toBeDefined();
      expect(obj.type).toBe('rectangle');
      expect(obj.x).toBe(300);
      expect(obj.y).toBe(400);
      expect(obj.width).toBe(DEFAULT_RECT_WIDTH);
      expect(obj.height).toBe(DEFAULT_RECT_HEIGHT);
      expect(obj.fill).toBe(DEFAULT_FILL);
      expect(obj.stroke).toBe(DEFAULT_STROKE);
    });

    it('creates a rectangle with custom dimensions', () => {
      const id = createRectangle(objectsMap, 0, 0, 500, 300);
      const obj = objectsMap.get(id) as RectangleShape;

      expect(obj.width).toBe(500);
      expect(obj.height).toBe(300);
    });
  });

  describe('updateObject', () => {
    it('updates position of an existing object', () => {
      const id = createStickyNote(objectsMap, 0, 0);
      updateObject(objectsMap, id, { x: 250, y: 350 });

      const obj = objectsMap.get(id) as StickyNote;
      expect(obj.x).toBe(250);
      expect(obj.y).toBe(350);
    });

    it('updates dimensions (resize)', () => {
      const id = createRectangle(objectsMap, 0, 0);
      updateObject(objectsMap, id, { width: 400, height: 250 });

      const obj = objectsMap.get(id) as RectangleShape;
      expect(obj.width).toBe(400);
      expect(obj.height).toBe(250);
    });

    it('updates rotation', () => {
      const id = createRectangle(objectsMap, 0, 0);
      updateObject(objectsMap, id, { rotation: 45 });

      const obj = objectsMap.get(id) as RectangleShape;
      expect(obj.rotation).toBe(45);
    });

    it('updates text on a sticky note', () => {
      const id = createStickyNote(objectsMap, 0, 0, 'initial');
      updateObject(objectsMap, id, { text: 'updated text' } as Partial<BoardObject>);

      const obj = objectsMap.get(id) as StickyNote;
      expect(obj.text).toBe('updated text');
    });

    it('preserves other fields when updating', () => {
      const id = createStickyNote(objectsMap, 100, 200, 'test', '#FF9800');
      updateObject(objectsMap, id, { x: 300 });

      const obj = objectsMap.get(id) as StickyNote;
      expect(obj.x).toBe(300);
      expect(obj.y).toBe(200);
      expect(obj.text).toBe('test');
      expect(obj.color).toBe('#FF9800');
      expect(obj.type).toBe('sticky');
    });

    it('updates lastModifiedBy and lastModifiedAt', () => {
      const id = createStickyNote(objectsMap, 0, 0);
      const beforeUpdate = Date.now();
      updateObject(objectsMap, id, { x: 50 });

      const obj = objectsMap.get(id) as StickyNote;
      expect(obj.lastModifiedBy).toBe(userId);
      expect(obj.lastModifiedAt).toBeGreaterThanOrEqual(beforeUpdate);
    });

    it('does nothing for non-existent object', () => {
      updateObject(objectsMap, 'non-existent-id', { x: 100 });
      expect(objectsMap.size).toBe(0);
    });
  });

  describe('deleteObject', () => {
    it('removes an object from the map', () => {
      const id = createStickyNote(objectsMap, 0, 0);
      expect(objectsMap.size).toBe(1);

      deleteObject(objectsMap, id);
      expect(objectsMap.size).toBe(0);
      expect(objectsMap.get(id)).toBeUndefined();
    });
  });

  describe('Yjs sync between two docs', () => {
    it('syncs object creation between two Y.Doc instances', () => {
      const doc2 = new Y.Doc();
      const map2 = doc2.getMap('objects');

      // Apply updates from doc1 to doc2
      const id = createStickyNote(objectsMap, 100, 200, 'synced');

      const update = Y.encodeStateAsUpdate(doc);
      Y.applyUpdate(doc2, update);

      const syncedObj = map2.get(id) as StickyNote;
      expect(syncedObj).toBeDefined();
      expect(syncedObj.type).toBe('sticky');
      expect(syncedObj.x).toBe(100);
      expect(syncedObj.y).toBe(200);
      expect(syncedObj.text).toBe('synced');

      doc2.destroy();
    });

    it('syncs object updates between two Y.Doc instances', () => {
      const doc2 = new Y.Doc();
      const map2 = doc2.getMap('objects');

      const id = createStickyNote(objectsMap, 0, 0);

      // Sync initial state
      Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc));

      // Update position in doc1
      updateObject(objectsMap, id, { x: 500, y: 600 });

      // Sync update to doc2
      Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc));

      const syncedObj = map2.get(id) as StickyNote;
      expect(syncedObj.x).toBe(500);
      expect(syncedObj.y).toBe(600);

      doc2.destroy();
    });

    it('syncs object deletion between two Y.Doc instances', () => {
      const doc2 = new Y.Doc();
      const map2 = doc2.getMap('objects');

      const id = createStickyNote(objectsMap, 0, 0);
      Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc));
      expect(map2.get(id)).toBeDefined();

      deleteObject(objectsMap, id);
      Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc));
      expect(map2.get(id)).toBeUndefined();

      doc2.destroy();
    });
  });
});
