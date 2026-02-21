/**
 * AI Executor Test Suite
 *
 * Tests for AI tool execution against real Yjs documents.
 * Following the project rule: "Never mock Yjs in tests — use real
 * in-memory Y.Doc instances."
 *
 * Covers:
 * - get_board_state
 * - create_sticky_note
 * - create_rectangle
 * - create_text
 * - create_frame
 * - create_connector
 * - move_object
 * - resize_object
 * - update_text
 * - change_color
 * - delete_object (with cascade connector deletion)
 * - delete_all
 * - Unknown tool dispatch
 * - Object limit enforcement
 */

import { describe, expect, it } from 'vitest';
import { Doc } from 'yjs';
import type { BoardObject, StickyNote, RectangleShape, TextElement, Frame, Connector } from '@collabboard/shared';
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
  DEFAULT_FRAME_WIDTH,
  DEFAULT_FRAME_HEIGHT,
  DEFAULT_FRAME_FILL,
  DEFAULT_CONNECTOR_STROKE,
  MAX_OBJECTS_PER_BOARD,
} from '@collabboard/shared';
import { executeTool } from './executor.js';

const TEST_USER = 'test-user';

/** Helper: create a fresh Y.Doc for each test. */
function makeDoc(): Doc {
  return new Doc();
}

/** Helper: seed a board object directly into the Yjs map. */
function seedObject(doc: Doc, obj: BoardObject): void {
  doc.getMap('objects').set(obj.id, obj);
}

/** Helper: read an object back from the Yjs map. */
function getObject(doc: Doc, id: string): BoardObject | undefined {
  return doc.getMap('objects').get(id) as BoardObject | undefined;
}

/** Helper: count objects in the Yjs map. */
function objectCount(doc: Doc): number {
  return doc.getMap('objects').size;
}

/** Helper: build a minimal sticky note for seeding. */
function makeSticky(overrides: Partial<StickyNote> & { id: string }): StickyNote {
  return {
    type: 'sticky',
    x: 0,
    y: 0,
    width: DEFAULT_STICKY_WIDTH,
    height: DEFAULT_STICKY_HEIGHT,
    rotation: 0,
    zIndex: 0,
    lastModifiedBy: TEST_USER,
    lastModifiedAt: Date.now(),
    text: 'Test',
    color: DEFAULT_STICKY_COLOR,
    ...overrides,
  };
}

/** Helper: build a minimal rectangle for seeding. */
function makeRect(overrides: Partial<RectangleShape> & { id: string }): RectangleShape {
  return {
    type: 'rectangle',
    x: 0,
    y: 0,
    width: DEFAULT_RECT_WIDTH,
    height: DEFAULT_RECT_HEIGHT,
    rotation: 0,
    zIndex: 0,
    lastModifiedBy: TEST_USER,
    lastModifiedAt: Date.now(),
    fill: DEFAULT_FILL,
    stroke: DEFAULT_STROKE,
    ...overrides,
  };
}

/** Helper: build a minimal connector for seeding. */
function makeConnector(overrides: Partial<Connector> & { id: string; fromId: string; toId: string }): Connector {
  return {
    type: 'connector',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    rotation: 0,
    zIndex: 0,
    lastModifiedBy: TEST_USER,
    lastModifiedAt: Date.now(),
    stroke: DEFAULT_CONNECTOR_STROKE,
    style: 'straight',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// get_board_state
// ---------------------------------------------------------------------------

describe('AI Tools - get_board_state', () => {
  it('should return empty array when no objects', () => {
    const doc = makeDoc();
    const result = executeTool('get_board_state', {}, doc, TEST_USER);

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
    expect(result.message).toContain('0');
  });

  it('should return all objects on the board', () => {
    const doc = makeDoc();
    seedObject(doc, makeSticky({ id: 'sticky-1', text: 'Hello' }));
    seedObject(doc, makeRect({ id: 'rect-1', x: 100, y: 200 }));

    const result = executeTool('get_board_state', {}, doc, TEST_USER);

    expect(result.success).toBe(true);
    const data = result.data as BoardObject[];
    expect(data).toHaveLength(2);
    expect(result.message).toContain('2');
  });

  it('should skip invalid objects', () => {
    const doc = makeDoc();
    seedObject(doc, makeSticky({ id: 'valid' }));
    // Seed an invalid object directly (missing required fields)
    doc.getMap('objects').set('bad', { id: 'bad', type: 'unknown-garbage' });

    const result = executeTool('get_board_state', {}, doc, TEST_USER);

    expect(result.success).toBe(true);
    const data = result.data as BoardObject[];
    expect(data).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// create_sticky_note
// ---------------------------------------------------------------------------

describe('AI Tools - create_sticky_note', () => {
  it('should create a sticky note with provided parameters', () => {
    const doc = makeDoc();
    const result = executeTool(
      'create_sticky_note',
      { text: 'Hello World', x: 100, y: 200, color: '#FF9800' },
      doc,
      TEST_USER,
    );

    expect(result.success).toBe(true);
    const data = result.data as { id: string };
    expect(data.id).toBeDefined();

    const created = getObject(doc, data.id) as StickyNote;
    expect(created).toBeDefined();
    expect(created.type).toBe('sticky');
    expect(created.text).toBe('Hello World');
    expect(created.x).toBe(100);
    expect(created.y).toBe(200);
    expect(created.color).toBe('#FF9800');
    expect(created.lastModifiedBy).toBe(TEST_USER);
  });

  it('should use default color when none provided', () => {
    const doc = makeDoc();
    const result = executeTool(
      'create_sticky_note',
      { text: 'Note', x: 0, y: 0 },
      doc,
      TEST_USER,
    );

    expect(result.success).toBe(true);
    const data = result.data as { id: string };
    const created = getObject(doc, data.id) as StickyNote;
    expect(created.color).toBe(DEFAULT_STICKY_COLOR);
  });

  it('should use default dimensions', () => {
    const doc = makeDoc();
    const result = executeTool(
      'create_sticky_note',
      { text: 'Note', x: 0, y: 0 },
      doc,
      TEST_USER,
    );

    const data = result.data as { id: string };
    const created = getObject(doc, data.id) as StickyNote;
    expect(created.width).toBe(DEFAULT_STICKY_WIDTH);
    expect(created.height).toBe(DEFAULT_STICKY_HEIGHT);
  });

  it('should set zIndex to current object count', () => {
    const doc = makeDoc();
    seedObject(doc, makeSticky({ id: 'existing' }));

    const result = executeTool(
      'create_sticky_note',
      { text: 'Second', x: 0, y: 0 },
      doc,
      TEST_USER,
    );

    const data = result.data as { id: string };
    const created = getObject(doc, data.id) as StickyNote;
    expect(created.zIndex).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// create_rectangle
// ---------------------------------------------------------------------------

describe('AI Tools - create_rectangle', () => {
  it('should create a rectangle with provided dimensions', () => {
    const doc = makeDoc();
    const result = executeTool(
      'create_rectangle',
      { x: 50, y: 75, width: 300, height: 200, fill: '#FF0000', stroke: '#000' },
      doc,
      TEST_USER,
    );

    expect(result.success).toBe(true);
    const data = result.data as { id: string };
    const created = getObject(doc, data.id) as RectangleShape;
    expect(created.type).toBe('rectangle');
    expect(created.x).toBe(50);
    expect(created.y).toBe(75);
    expect(created.width).toBe(300);
    expect(created.height).toBe(200);
    expect(created.fill).toBe('#FF0000');
    expect(created.stroke).toBe('#000');
  });

  it('should use default dimensions when not specified', () => {
    const doc = makeDoc();
    const result = executeTool(
      'create_rectangle',
      { x: 0, y: 0 },
      doc,
      TEST_USER,
    );

    const data = result.data as { id: string };
    const created = getObject(doc, data.id) as RectangleShape;
    expect(created.width).toBe(DEFAULT_RECT_WIDTH);
    expect(created.height).toBe(DEFAULT_RECT_HEIGHT);
    expect(created.fill).toBe(DEFAULT_FILL);
    expect(created.stroke).toBe(DEFAULT_STROKE);
  });
});

// ---------------------------------------------------------------------------
// create_text
// ---------------------------------------------------------------------------

describe('AI Tools - create_text', () => {
  it('should create a text element with provided content', () => {
    const doc = makeDoc();
    const result = executeTool(
      'create_text',
      { text: 'Hello', x: 10, y: 20, fontSize: 32, fill: '#111' },
      doc,
      TEST_USER,
    );

    expect(result.success).toBe(true);
    const data = result.data as { id: string };
    const created = getObject(doc, data.id) as TextElement;
    expect(created.type).toBe('text');
    expect(created.text).toBe('Hello');
    expect(created.fontSize).toBe(32);
    expect(created.fill).toBe('#111');
  });

  it('should use default font size and fill', () => {
    const doc = makeDoc();
    const result = executeTool(
      'create_text',
      { text: 'Default', x: 0, y: 0 },
      doc,
      TEST_USER,
    );

    const data = result.data as { id: string };
    const created = getObject(doc, data.id) as TextElement;
    expect(created.fontSize).toBe(DEFAULT_TEXT_FONT_SIZE);
    expect(created.fill).toBe(DEFAULT_TEXT_FILL);
  });
});

// ---------------------------------------------------------------------------
// create_frame
// ---------------------------------------------------------------------------

describe('AI Tools - create_frame', () => {
  it('should create a frame with title and dimensions', () => {
    const doc = makeDoc();
    const result = executeTool(
      'create_frame',
      { title: 'Sprint Board', x: 50, y: 50, width: 800, height: 600 },
      doc,
      TEST_USER,
    );

    expect(result.success).toBe(true);
    const data = result.data as { id: string };
    const created = getObject(doc, data.id) as Frame;
    expect(created.type).toBe('frame');
    expect(created.title).toBe('Sprint Board');
    expect(created.width).toBe(800);
    expect(created.height).toBe(600);
    expect(created.zIndex).toBe(0); // Frames always at z=0
    expect(created.fill).toBe(DEFAULT_FRAME_FILL);
  });

  it('should use default dimensions when not specified', () => {
    const doc = makeDoc();
    const result = executeTool(
      'create_frame',
      { title: 'Default', x: 0, y: 0 },
      doc,
      TEST_USER,
    );

    const data = result.data as { id: string };
    const created = getObject(doc, data.id) as Frame;
    expect(created.width).toBe(DEFAULT_FRAME_WIDTH);
    expect(created.height).toBe(DEFAULT_FRAME_HEIGHT);
  });
});

// ---------------------------------------------------------------------------
// create_connector
// ---------------------------------------------------------------------------

describe('AI Tools - create_connector', () => {
  it('should create a connector between two existing objects', () => {
    const doc = makeDoc();
    seedObject(doc, makeSticky({ id: 'sticky-a' }));
    seedObject(doc, makeRect({ id: 'rect-b' }));

    const result = executeTool(
      'create_connector',
      { fromId: 'sticky-a', toId: 'rect-b', stroke: '#333' },
      doc,
      TEST_USER,
    );

    expect(result.success).toBe(true);
    const data = result.data as { id: string };
    const created = getObject(doc, data.id) as Connector;
    expect(created.type).toBe('connector');
    expect(created.fromId).toBe('sticky-a');
    expect(created.toId).toBe('rect-b');
    expect(created.stroke).toBe('#333');
    expect(created.style).toBe('straight');
  });

  it('should use default stroke when not specified', () => {
    const doc = makeDoc();
    seedObject(doc, makeSticky({ id: 'a' }));
    seedObject(doc, makeSticky({ id: 'b' }));

    const result = executeTool(
      'create_connector',
      { fromId: 'a', toId: 'b' },
      doc,
      TEST_USER,
    );

    const data = result.data as { id: string };
    const created = getObject(doc, data.id) as Connector;
    expect(created.stroke).toBe(DEFAULT_CONNECTOR_STROKE);
  });

  it('should fail when source object not found', () => {
    const doc = makeDoc();
    seedObject(doc, makeSticky({ id: 'exists' }));

    const result = executeTool(
      'create_connector',
      { fromId: 'nonexistent', toId: 'exists' },
      doc,
      TEST_USER,
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('not found');
    expect(result.message).toContain('nonexistent');
  });

  it('should fail when target object not found', () => {
    const doc = makeDoc();
    seedObject(doc, makeSticky({ id: 'exists' }));

    const result = executeTool(
      'create_connector',
      { fromId: 'exists', toId: 'nonexistent' },
      doc,
      TEST_USER,
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('not found');
    expect(result.message).toContain('nonexistent');
  });
});

// ---------------------------------------------------------------------------
// move_object
// ---------------------------------------------------------------------------

describe('AI Tools - move_object', () => {
  it('should move an existing object to new coordinates', () => {
    const doc = makeDoc();
    seedObject(doc, makeSticky({ id: 'move-me', x: 10, y: 20 }));

    const result = executeTool(
      'move_object',
      { objectId: 'move-me', x: 500, y: 600 },
      doc,
      TEST_USER,
    );

    expect(result.success).toBe(true);
    const updated = getObject(doc, 'move-me') as StickyNote;
    expect(updated.x).toBe(500);
    expect(updated.y).toBe(600);
    expect(updated.lastModifiedBy).toBe(TEST_USER);
  });

  it('should preserve other properties when moving', () => {
    const doc = makeDoc();
    seedObject(doc, makeSticky({ id: 'move-me', text: 'Keep this', color: '#FF0000' }));

    executeTool('move_object', { objectId: 'move-me', x: 999, y: 999 }, doc, TEST_USER);

    const updated = getObject(doc, 'move-me') as StickyNote;
    expect(updated.text).toBe('Keep this');
    expect(updated.color).toBe('#FF0000');
  });

  it('should fail when object not found', () => {
    const doc = makeDoc();
    const result = executeTool(
      'move_object',
      { objectId: 'nonexistent', x: 0, y: 0 },
      doc,
      TEST_USER,
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('not found');
  });
});

// ---------------------------------------------------------------------------
// resize_object
// ---------------------------------------------------------------------------

describe('AI Tools - resize_object', () => {
  it('should resize an existing object', () => {
    const doc = makeDoc();
    seedObject(doc, makeRect({ id: 'resize-me', width: 100, height: 50 }));

    const result = executeTool(
      'resize_object',
      { objectId: 'resize-me', width: 400, height: 300 },
      doc,
      TEST_USER,
    );

    expect(result.success).toBe(true);
    const updated = getObject(doc, 'resize-me') as RectangleShape;
    expect(updated.width).toBe(400);
    expect(updated.height).toBe(300);
  });

  it('should fail when object not found', () => {
    const doc = makeDoc();
    const result = executeTool(
      'resize_object',
      { objectId: 'nonexistent', width: 100, height: 100 },
      doc,
      TEST_USER,
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('not found');
  });
});

// ---------------------------------------------------------------------------
// update_text
// ---------------------------------------------------------------------------

describe('AI Tools - update_text', () => {
  it('should update text on a sticky note', () => {
    const doc = makeDoc();
    seedObject(doc, makeSticky({ id: 'sticky-1', text: 'Old text' }));

    const result = executeTool(
      'update_text',
      { objectId: 'sticky-1', text: 'New text' },
      doc,
      TEST_USER,
    );

    expect(result.success).toBe(true);
    const updated = getObject(doc, 'sticky-1') as StickyNote;
    expect(updated.text).toBe('New text');
  });

  it('should update text on a text element', () => {
    const doc = makeDoc();
    const textEl: TextElement = {
      id: 'text-1',
      type: 'text',
      x: 0,
      y: 0,
      width: 200,
      height: 30,
      rotation: 0,
      zIndex: 0,
      lastModifiedBy: TEST_USER,
      lastModifiedAt: Date.now(),
      text: 'Old',
      fontSize: 20,
      fill: '#333',
    };
    seedObject(doc, textEl);

    const result = executeTool(
      'update_text',
      { objectId: 'text-1', text: 'Updated' },
      doc,
      TEST_USER,
    );

    expect(result.success).toBe(true);
    const updated = getObject(doc, 'text-1') as TextElement;
    expect(updated.text).toBe('Updated');
  });

  it('should update title on a frame', () => {
    const doc = makeDoc();
    const frame: Frame = {
      id: 'frame-1',
      type: 'frame',
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      rotation: 0,
      zIndex: 0,
      lastModifiedBy: TEST_USER,
      lastModifiedAt: Date.now(),
      title: 'Old Title',
      fill: DEFAULT_FRAME_FILL,
    };
    seedObject(doc, frame);

    const result = executeTool(
      'update_text',
      { objectId: 'frame-1', text: 'New Title' },
      doc,
      TEST_USER,
    );

    expect(result.success).toBe(true);
    const updated = getObject(doc, 'frame-1') as Frame;
    expect(updated.title).toBe('New Title');
  });

  it('should fail on a rectangle (no editable text)', () => {
    const doc = makeDoc();
    seedObject(doc, makeRect({ id: 'rect-1' }));

    const result = executeTool(
      'update_text',
      { objectId: 'rect-1', text: 'Nope' },
      doc,
      TEST_USER,
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('does not have editable text');
  });

  it('should fail when object not found', () => {
    const doc = makeDoc();
    const result = executeTool(
      'update_text',
      { objectId: 'nonexistent', text: 'Hello' },
      doc,
      TEST_USER,
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('not found');
  });
});

// ---------------------------------------------------------------------------
// change_color
// ---------------------------------------------------------------------------

describe('AI Tools - change_color', () => {
  it('should change color of a sticky note', () => {
    const doc = makeDoc();
    seedObject(doc, makeSticky({ id: 'sticky-1', color: '#FFEB3B' }));

    const result = executeTool(
      'change_color',
      { objectId: 'sticky-1', color: '#E91E63' },
      doc,
      TEST_USER,
    );

    expect(result.success).toBe(true);
    const updated = getObject(doc, 'sticky-1') as StickyNote;
    expect(updated.color).toBe('#E91E63');
  });

  it('should change fill color of a rectangle', () => {
    const doc = makeDoc();
    seedObject(doc, makeRect({ id: 'rect-1', fill: '#4CAF50' }));

    const result = executeTool(
      'change_color',
      { objectId: 'rect-1', color: '#FF0000' },
      doc,
      TEST_USER,
    );

    expect(result.success).toBe(true);
    const updated = getObject(doc, 'rect-1') as RectangleShape;
    expect(updated.fill).toBe('#FF0000');
  });

  it('should change stroke color of a connector', () => {
    const doc = makeDoc();
    seedObject(doc, makeSticky({ id: 'a' }));
    seedObject(doc, makeSticky({ id: 'b' }));
    seedObject(doc, makeConnector({ id: 'conn-1', fromId: 'a', toId: 'b', stroke: '#666' }));

    const result = executeTool(
      'change_color',
      { objectId: 'conn-1', color: '#FF0000' },
      doc,
      TEST_USER,
    );

    expect(result.success).toBe(true);
    const updated = getObject(doc, 'conn-1') as Connector;
    expect(updated.stroke).toBe('#FF0000');
  });

  it('should fail on a frame (not colorable)', () => {
    const doc = makeDoc();
    const frame: Frame = {
      id: 'frame-1',
      type: 'frame',
      x: 0, y: 0, width: 400, height: 300, rotation: 0, zIndex: 0,
      lastModifiedBy: TEST_USER, lastModifiedAt: Date.now(),
      title: 'F', fill: DEFAULT_FRAME_FILL,
    };
    seedObject(doc, frame);

    const result = executeTool(
      'change_color',
      { objectId: 'frame-1', color: '#FF0000' },
      doc,
      TEST_USER,
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('Cannot change color');
  });

  it('should fail when object not found', () => {
    const doc = makeDoc();
    const result = executeTool(
      'change_color',
      { objectId: 'nonexistent', color: '#000' },
      doc,
      TEST_USER,
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('not found');
  });
});

// ---------------------------------------------------------------------------
// delete_object
// ---------------------------------------------------------------------------

describe('AI Tools - delete_object', () => {
  it('should delete an existing object', () => {
    const doc = makeDoc();
    seedObject(doc, makeSticky({ id: 'delete-me' }));
    expect(objectCount(doc)).toBe(1);

    const result = executeTool(
      'delete_object',
      { objectId: 'delete-me' },
      doc,
      TEST_USER,
    );

    expect(result.success).toBe(true);
    expect(objectCount(doc)).toBe(0);
    expect(getObject(doc, 'delete-me')).toBeUndefined();
  });

  it('should cascade-delete connectors referencing the deleted object', () => {
    const doc = makeDoc();
    seedObject(doc, makeSticky({ id: 'a' }));
    seedObject(doc, makeSticky({ id: 'b' }));
    seedObject(doc, makeSticky({ id: 'c' }));
    seedObject(doc, makeConnector({ id: 'conn-ab', fromId: 'a', toId: 'b' }));
    seedObject(doc, makeConnector({ id: 'conn-ac', fromId: 'a', toId: 'c' }));
    seedObject(doc, makeConnector({ id: 'conn-bc', fromId: 'b', toId: 'c' }));
    expect(objectCount(doc)).toBe(6);

    // Delete 'a' — should cascade conn-ab and conn-ac
    const result = executeTool(
      'delete_object',
      { objectId: 'a' },
      doc,
      TEST_USER,
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain('2 connected connector');
    expect(objectCount(doc)).toBe(3); // b, c, conn-bc remain
    expect(getObject(doc, 'a')).toBeUndefined();
    expect(getObject(doc, 'conn-ab')).toBeUndefined();
    expect(getObject(doc, 'conn-ac')).toBeUndefined();
    expect(getObject(doc, 'conn-bc')).toBeDefined();
  });

  it('should fail when object not found', () => {
    const doc = makeDoc();
    const result = executeTool(
      'delete_object',
      { objectId: 'nonexistent' },
      doc,
      TEST_USER,
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('not found');
  });
});

// ---------------------------------------------------------------------------
// delete_all
// ---------------------------------------------------------------------------

describe('AI Tools - delete_all', () => {
  it('should delete all objects from the board', () => {
    const doc = makeDoc();
    seedObject(doc, makeSticky({ id: 'a' }));
    seedObject(doc, makeSticky({ id: 'b' }));
    seedObject(doc, makeRect({ id: 'c' }));
    expect(objectCount(doc)).toBe(3);

    const result = executeTool('delete_all', {}, doc, TEST_USER);

    expect(result.success).toBe(true);
    expect(result.message).toContain('3');
    expect(objectCount(doc)).toBe(0);
  });

  it('should succeed on an empty board', () => {
    const doc = makeDoc();
    const result = executeTool('delete_all', {}, doc, TEST_USER);

    expect(result.success).toBe(true);
    expect(result.message).toContain('0');
  });

  it('should delete all in a single transaction', () => {
    const doc = makeDoc();
    seedObject(doc, makeSticky({ id: 'a' }));
    seedObject(doc, makeSticky({ id: 'b' }));
    seedObject(doc, makeSticky({ id: 'c' }));

    // Track how many Yjs update events fire
    let updateCount = 0;
    doc.on('update', () => { updateCount++; });

    executeTool('delete_all', {}, doc, TEST_USER);

    // A single transact() should produce exactly 1 update event
    expect(updateCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Unknown tool
// ---------------------------------------------------------------------------

describe('AI Tools - unknown tool dispatch', () => {
  it('should fail for an unknown tool name', () => {
    const doc = makeDoc();
    const result = executeTool('nonexistent_tool', {}, doc, TEST_USER);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Unknown tool');
    expect(result.message).toContain('nonexistent_tool');
  });
});

// ---------------------------------------------------------------------------
// Object limit
// ---------------------------------------------------------------------------

describe('AI Tools - object limit enforcement', () => {
  it('should reject creation when board is at capacity', () => {
    const doc = makeDoc();
    const objectsMap = doc.getMap('objects');

    // Fill the board to capacity
    for (let i = 0; i < MAX_OBJECTS_PER_BOARD; i++) {
      objectsMap.set(`fill-${String(i)}`, makeSticky({ id: `fill-${String(i)}` }));
    }
    expect(objectCount(doc)).toBe(MAX_OBJECTS_PER_BOARD);

    // Try to create one more — each creation tool should fail
    const stickyResult = executeTool('create_sticky_note', { text: 'Overflow', x: 0, y: 0 }, doc, TEST_USER);
    expect(stickyResult.success).toBe(false);
    expect(stickyResult.message).toContain('limit');

    const rectResult = executeTool('create_rectangle', { x: 0, y: 0 }, doc, TEST_USER);
    expect(rectResult.success).toBe(false);

    const textResult = executeTool('create_text', { text: 'X', x: 0, y: 0 }, doc, TEST_USER);
    expect(textResult.success).toBe(false);

    const frameResult = executeTool('create_frame', { title: 'F', x: 0, y: 0 }, doc, TEST_USER);
    expect(frameResult.success).toBe(false);

    // Connector also requires capacity
    const connResult = executeTool('create_connector', { fromId: 'fill-0', toId: 'fill-1' }, doc, TEST_USER);
    expect(connResult.success).toBe(false);

    // Count unchanged
    expect(objectCount(doc)).toBe(MAX_OBJECTS_PER_BOARD);
  });
});

// ---------------------------------------------------------------------------
// lastModifiedBy stamping
// ---------------------------------------------------------------------------

describe('AI Tools - user stamping', () => {
  it('should stamp lastModifiedBy on creation', () => {
    const doc = makeDoc();
    const result = executeTool(
      'create_sticky_note',
      { text: 'Stamp test', x: 0, y: 0 },
      doc,
      'ai-user-123',
    );

    const data = result.data as { id: string };
    const created = getObject(doc, data.id) as StickyNote;
    expect(created.lastModifiedBy).toBe('ai-user-123');
  });

  it('should stamp lastModifiedBy on mutation', () => {
    const doc = makeDoc();
    seedObject(doc, makeSticky({ id: 's1', lastModifiedBy: 'original-user' }));

    executeTool('move_object', { objectId: 's1', x: 999, y: 999 }, doc, 'ai-user-456');

    const updated = getObject(doc, 's1') as StickyNote;
    expect(updated.lastModifiedBy).toBe('ai-user-456');
  });
});
