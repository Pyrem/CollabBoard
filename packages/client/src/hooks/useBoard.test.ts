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
    parentId: null,
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
    parentId: null,
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

function batchUpdateObjects(
  map: Y.Map<unknown>,
  updates: Array<{ id: string; updates: Partial<BoardObject> }>,
): void {
  const ydoc = map.doc;
  if (!ydoc) return;
  ydoc.transact(() => {
    for (const { id, updates: partial } of updates) {
      const existing = map.get(id) as BoardObject | undefined;
      if (!existing) continue;
      map.set(id, {
        ...existing,
        ...partial,
        lastModifiedBy: userId,
        lastModifiedAt: Date.now(),
      });
    }
  });
}

function batchDeleteObjects(map: Y.Map<unknown>, ids: string[]): void {
  const ydoc = map.doc;
  if (!ydoc) return;
  ydoc.transact(() => {
    for (const id of ids) {
      map.delete(id);
    }
  });
}

function batchCreateObjects(map: Y.Map<unknown>, objects: BoardObject[]): void {
  const ydoc = map.doc;
  if (!ydoc) return;
  ydoc.transact(() => {
    for (const obj of objects) {
      map.set(obj.id, {
        ...obj,
        lastModifiedBy: userId,
        lastModifiedAt: Date.now(),
      });
    }
  });
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

  describe('batchUpdateObjects', () => {
    it('updates multiple objects in a single transaction', () => {
      const id1 = createStickyNote(objectsMap, 0, 0, 'a');
      const id2 = createStickyNote(objectsMap, 100, 100, 'b');
      const id3 = createRectangle(objectsMap, 200, 200);

      batchUpdateObjects(objectsMap, [
        { id: id1, updates: { x: 50, y: 50 } },
        { id: id2, updates: { x: 150, y: 150 } },
        { id: id3, updates: { x: 250, y: 250 } },
      ]);

      const obj1 = objectsMap.get(id1) as StickyNote;
      const obj2 = objectsMap.get(id2) as StickyNote;
      const obj3 = objectsMap.get(id3) as RectangleShape;

      expect(obj1.x).toBe(50);
      expect(obj1.y).toBe(50);
      expect(obj2.x).toBe(150);
      expect(obj2.y).toBe(150);
      expect(obj3.x).toBe(250);
      expect(obj3.y).toBe(250);
    });

    it('fires only one Yjs update event for multiple updates', () => {
      const id1 = createStickyNote(objectsMap, 0, 0);
      const id2 = createStickyNote(objectsMap, 100, 100);
      const id3 = createStickyNote(objectsMap, 200, 200);
      const id4 = createStickyNote(objectsMap, 300, 300);
      const id5 = createStickyNote(objectsMap, 400, 400);

      let updateCount = 0;
      doc.on('update', () => {
        updateCount++;
      });

      batchUpdateObjects(objectsMap, [
        { id: id1, updates: { x: 10 } },
        { id: id2, updates: { x: 20 } },
        { id: id3, updates: { x: 30 } },
        { id: id4, updates: { x: 40 } },
        { id: id5, updates: { x: 50 } },
      ]);

      expect(updateCount).toBe(1);
    });

    it('skips non-existent objects without failing', () => {
      const id1 = createStickyNote(objectsMap, 0, 0);

      batchUpdateObjects(objectsMap, [
        { id: id1, updates: { x: 99 } },
        { id: 'non-existent', updates: { x: 100 } },
      ]);

      expect((objectsMap.get(id1) as StickyNote).x).toBe(99);
      expect(objectsMap.size).toBe(1);
    });

    it('stamps lastModifiedBy on all updated objects', () => {
      const id1 = createStickyNote(objectsMap, 0, 0);
      const id2 = createRectangle(objectsMap, 100, 100);

      batchUpdateObjects(objectsMap, [
        { id: id1, updates: { x: 10 } },
        { id: id2, updates: { x: 20 } },
      ]);

      expect((objectsMap.get(id1) as StickyNote).lastModifiedBy).toBe(userId);
      expect((objectsMap.get(id2) as RectangleShape).lastModifiedBy).toBe(userId);
    });
  });

  describe('batchDeleteObjects', () => {
    it('deletes multiple objects in a single transaction', () => {
      const id1 = createStickyNote(objectsMap, 0, 0);
      const id2 = createStickyNote(objectsMap, 100, 100);
      const id3 = createRectangle(objectsMap, 200, 200);
      expect(objectsMap.size).toBe(3);

      batchDeleteObjects(objectsMap, [id1, id3]);

      expect(objectsMap.size).toBe(1);
      expect(objectsMap.get(id1)).toBeUndefined();
      expect(objectsMap.get(id2)).toBeDefined();
      expect(objectsMap.get(id3)).toBeUndefined();
    });

    it('fires only one Yjs update event for multiple deletes', () => {
      const id1 = createStickyNote(objectsMap, 0, 0);
      const id2 = createStickyNote(objectsMap, 100, 100);
      const id3 = createStickyNote(objectsMap, 200, 200);

      let updateCount = 0;
      doc.on('update', () => {
        updateCount++;
      });

      batchDeleteObjects(objectsMap, [id1, id2, id3]);

      expect(updateCount).toBe(1);
      expect(objectsMap.size).toBe(0);
    });
  });

  describe('batchCreateObjects', () => {
    it('creates multiple objects in a single transaction', () => {
      const objects: BoardObject[] = [
        {
          id: 'batch-1',
          type: 'sticky',
          x: 0,
          y: 0,
          width: DEFAULT_STICKY_WIDTH,
          height: DEFAULT_STICKY_HEIGHT,
          rotation: 0,
          zIndex: 0,
          lastModifiedBy: userId,
          lastModifiedAt: Date.now(),
          parentId: null,
          text: 'first',
          color: DEFAULT_STICKY_COLOR,
        },
        {
          id: 'batch-2',
          type: 'rectangle',
          x: 100,
          y: 100,
          width: DEFAULT_RECT_WIDTH,
          height: DEFAULT_RECT_HEIGHT,
          rotation: 0,
          zIndex: 1,
          lastModifiedBy: userId,
          lastModifiedAt: Date.now(),
          parentId: null,
          fill: DEFAULT_FILL,
          stroke: DEFAULT_STROKE,
        },
      ];

      batchCreateObjects(objectsMap, objects);

      expect(objectsMap.size).toBe(2);
      expect((objectsMap.get('batch-1') as StickyNote).text).toBe('first');
      expect((objectsMap.get('batch-2') as RectangleShape).x).toBe(100);
    });

    it('fires only one Yjs update event for multiple creates', () => {
      let updateCount = 0;
      doc.on('update', () => {
        updateCount++;
      });

      const objects: BoardObject[] = [
        {
          id: 'bc-1',
          type: 'sticky',
          x: 0, y: 0,
          width: DEFAULT_STICKY_WIDTH, height: DEFAULT_STICKY_HEIGHT,
          rotation: 0, zIndex: 0,
          lastModifiedBy: userId, lastModifiedAt: Date.now(),
          parentId: null,
          text: '', color: DEFAULT_STICKY_COLOR,
        },
        {
          id: 'bc-2',
          type: 'sticky',
          x: 50, y: 50,
          width: DEFAULT_STICKY_WIDTH, height: DEFAULT_STICKY_HEIGHT,
          rotation: 0, zIndex: 1,
          lastModifiedBy: userId, lastModifiedAt: Date.now(),
          parentId: null,
          text: '', color: DEFAULT_STICKY_COLOR,
        },
        {
          id: 'bc-3',
          type: 'sticky',
          x: 100, y: 100,
          width: DEFAULT_STICKY_WIDTH, height: DEFAULT_STICKY_HEIGHT,
          rotation: 0, zIndex: 2,
          lastModifiedBy: userId, lastModifiedAt: Date.now(),
          parentId: null,
          text: '', color: DEFAULT_STICKY_COLOR,
        },
      ];

      batchCreateObjects(objectsMap, objects);

      expect(updateCount).toBe(1);
      expect(objectsMap.size).toBe(3);
    });

    it('syncs batch updates to a second Y.Doc in one update', () => {
      const doc2 = new Y.Doc();
      const map2 = doc2.getMap('objects');

      const id1 = createStickyNote(objectsMap, 0, 0);
      const id2 = createStickyNote(objectsMap, 100, 100);
      Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc));

      batchUpdateObjects(objectsMap, [
        { id: id1, updates: { x: 500 } },
        { id: id2, updates: { x: 600 } },
      ]);

      Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc));

      expect((map2.get(id1) as StickyNote).x).toBe(500);
      expect((map2.get(id2) as StickyNote).x).toBe(600);

      doc2.destroy();
    });
  });
});
