/**
 * AI Executor Test Suite
 *
 * Tests for AI tool execution against real Yjs documents.
 * Following the project rule: "Never mock Yjs in tests — use real
 * in-memory Y.Doc instances."
 *
 * Covers all 9 spec tools:
 * - getBoardState
 * - createStickyNote
 * - createShape (rectangle)
 * - createFrame
 * - createConnector
 * - moveObject
 * - resizeObject
 * - updateText
 * - changeColor
 * Plus: unknown tool dispatch, object limit enforcement, user stamping
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
  DEFAULT_FRAME_WIDTH,
  DEFAULT_FRAME_HEIGHT,
  DEFAULT_FRAME_FILL,
  DEFAULT_CONNECTOR_STROKE,
  DEFAULT_CONNECTOR_STROKE_WIDTH,
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
    parentId: null,
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
    parentId: null,
    fill: DEFAULT_FILL,
    stroke: DEFAULT_STROKE,
    ...overrides,
  };
}

/** Helper: build a minimal connector for seeding. */
function makeConnector(overrides: Partial<Connector> & { id: string; start: Connector['start']; end: Connector['end'] }): Connector {
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
    parentId: null,
    stroke: DEFAULT_CONNECTOR_STROKE,
    strokeWidth: DEFAULT_CONNECTOR_STROKE_WIDTH,
    style: 'straight',
    startCap: 'none',
    endCap: 'arrow',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getBoardState
// ---------------------------------------------------------------------------

describe('getBoardState', () => {
  it('should return empty array when no objects', () => {
    const doc = makeDoc();
    const result = executeTool('getBoardState', {}, doc, TEST_USER);

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
    expect(result.message).toContain('0');
  });

  it('should return all objects on the board', () => {
    const doc = makeDoc();
    seedObject(doc, makeSticky({ id: 'sticky-1', text: 'Hello' }));
    seedObject(doc, makeRect({ id: 'rect-1', x: 100, y: 200 }));

    const result = executeTool('getBoardState', {}, doc, TEST_USER);

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

    const result = executeTool('getBoardState', {}, doc, TEST_USER);

    expect(result.success).toBe(true);
    const data = result.data as BoardObject[];
    expect(data).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// createStickyNote
// ---------------------------------------------------------------------------

describe('createStickyNote', () => {
  it('should create a sticky note with provided parameters', () => {
    const doc = makeDoc();
    const result = executeTool(
      'createStickyNote',
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
      'createStickyNote',
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
      'createStickyNote',
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
      'createStickyNote',
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
// createShape
// ---------------------------------------------------------------------------

describe('createShape', () => {
  it('should create a rectangle with provided dimensions and color', () => {
    const doc = makeDoc();
    const result = executeTool(
      'createShape',
      { type: 'rectangle', x: 50, y: 75, width: 300, height: 200, color: '#FF0000' },
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
    expect(created.stroke).toBe(DEFAULT_STROKE);
  });

  it('should use default dimensions and color when not specified', () => {
    const doc = makeDoc();
    const result = executeTool(
      'createShape',
      { type: 'rectangle', x: 0, y: 0 },
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

  it('should reject unsupported shape types', () => {
    const doc = makeDoc();
    const result = executeTool(
      'createShape',
      { type: 'circle', x: 0, y: 0 },
      doc,
      TEST_USER,
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('Unsupported shape type');
    expect(result.message).toContain('circle');
    expect(objectCount(doc)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// createFrame
// ---------------------------------------------------------------------------

describe('createFrame', () => {
  it('should create a frame with title and dimensions', () => {
    const doc = makeDoc();
    const result = executeTool(
      'createFrame',
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
      'createFrame',
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
// createConnector
// ---------------------------------------------------------------------------

describe('createConnector', () => {
  it('should create a connector between two existing objects', () => {
    const doc = makeDoc();
    seedObject(doc, makeSticky({ id: 'sticky-a' }));
    seedObject(doc, makeRect({ id: 'rect-b' }));

    const result = executeTool(
      'createConnector',
      { fromId: 'sticky-a', toId: 'rect-b' },
      doc,
      TEST_USER,
    );

    expect(result.success).toBe(true);
    const data = result.data as { id: string };
    const created = getObject(doc, data.id) as Connector;
    expect(created.type).toBe('connector');
    expect(created.start).toEqual({ id: 'sticky-a', snapTo: 'auto' });
    expect(created.end).toEqual({ id: 'rect-b', snapTo: 'auto' });
    expect(created.stroke).toBe(DEFAULT_CONNECTOR_STROKE);
    expect(created.strokeWidth).toBe(DEFAULT_CONNECTOR_STROKE_WIDTH);
    expect(created.style).toBe('straight');
    expect(created.startCap).toBe('none');
    expect(created.endCap).toBe('arrow');
  });

  it('should respect style parameter', () => {
    const doc = makeDoc();
    seedObject(doc, makeSticky({ id: 'a' }));
    seedObject(doc, makeSticky({ id: 'b' }));

    const result = executeTool(
      'createConnector',
      { fromId: 'a', toId: 'b', style: 'curved' },
      doc,
      TEST_USER,
    );

    expect(result.success).toBe(true);
    const data = result.data as { id: string };
    const created = getObject(doc, data.id) as Connector;
    expect(created.style).toBe('curved');
  });

  it('should default to straight style when not specified', () => {
    const doc = makeDoc();
    seedObject(doc, makeSticky({ id: 'a' }));
    seedObject(doc, makeSticky({ id: 'b' }));

    const result = executeTool(
      'createConnector',
      { fromId: 'a', toId: 'b' },
      doc,
      TEST_USER,
    );

    const data = result.data as { id: string };
    const created = getObject(doc, data.id) as Connector;
    expect(created.style).toBe('straight');
  });

  it('should respect snap and cap parameters', () => {
    const doc = makeDoc();
    seedObject(doc, makeSticky({ id: 'a' }));
    seedObject(doc, makeSticky({ id: 'b' }));

    const result = executeTool(
      'createConnector',
      { fromId: 'a', toId: 'b', fromSnapTo: 'right', toSnapTo: 'left', startCap: 'arrow', endCap: 'none' },
      doc,
      TEST_USER,
    );

    expect(result.success).toBe(true);
    const data = result.data as { id: string };
    const created = getObject(doc, data.id) as Connector;
    expect(created.start).toEqual({ id: 'a', snapTo: 'right' });
    expect(created.end).toEqual({ id: 'b', snapTo: 'left' });
    expect(created.startCap).toBe('arrow');
    expect(created.endCap).toBe('none');
  });

  it('should fail when source object not found', () => {
    const doc = makeDoc();
    seedObject(doc, makeSticky({ id: 'exists' }));

    const result = executeTool(
      'createConnector',
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
      'createConnector',
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
// moveObject
// ---------------------------------------------------------------------------

describe('moveObject', () => {
  it('should move an existing object to new coordinates', () => {
    const doc = makeDoc();
    seedObject(doc, makeSticky({ id: 'move-me', x: 10, y: 20 }));

    const result = executeTool(
      'moveObject',
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

    executeTool('moveObject', { objectId: 'move-me', x: 999, y: 999 }, doc, TEST_USER);

    const updated = getObject(doc, 'move-me') as StickyNote;
    expect(updated.text).toBe('Keep this');
    expect(updated.color).toBe('#FF0000');
  });

  it('should fail when object not found', () => {
    const doc = makeDoc();
    const result = executeTool(
      'moveObject',
      { objectId: 'nonexistent', x: 0, y: 0 },
      doc,
      TEST_USER,
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('not found');
  });
});

// ---------------------------------------------------------------------------
// resizeObject
// ---------------------------------------------------------------------------

describe('resizeObject', () => {
  it('should resize an existing object', () => {
    const doc = makeDoc();
    seedObject(doc, makeRect({ id: 'resize-me', width: 100, height: 50 }));

    const result = executeTool(
      'resizeObject',
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
      'resizeObject',
      { objectId: 'nonexistent', width: 100, height: 100 },
      doc,
      TEST_USER,
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('not found');
  });

  it('should reject resizing a sticky note', () => {
    const doc = makeDoc();
    seedObject(doc, makeSticky({ id: 'sticky-resize' }));

    const result = executeTool(
      'resizeObject',
      { objectId: 'sticky-resize', width: 400, height: 400 },
      doc,
      TEST_USER,
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('cannot be resized');
    const unchanged = getObject(doc, 'sticky-resize') as StickyNote;
    expect(unchanged.width).toBe(DEFAULT_STICKY_WIDTH);
    expect(unchanged.height).toBe(DEFAULT_STICKY_HEIGHT);
  });
});

// ---------------------------------------------------------------------------
// updateText
// ---------------------------------------------------------------------------

describe('updateText', () => {
  it('should update text on a sticky note', () => {
    const doc = makeDoc();
    seedObject(doc, makeSticky({ id: 'sticky-1', text: 'Old text' }));

    const result = executeTool(
      'updateText',
      { objectId: 'sticky-1', newText: 'New text' },
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
      parentId: null,
      text: 'Old',
      fontSize: 20,
      fill: '#333',
    };
    seedObject(doc, textEl);

    const result = executeTool(
      'updateText',
      { objectId: 'text-1', newText: 'Updated' },
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
      parentId: null,
      title: 'Old Title',
      fill: DEFAULT_FRAME_FILL,
      childrenIds: [],
    };
    seedObject(doc, frame);

    const result = executeTool(
      'updateText',
      { objectId: 'frame-1', newText: 'New Title' },
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
      'updateText',
      { objectId: 'rect-1', newText: 'Nope' },
      doc,
      TEST_USER,
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('does not have editable text');
  });

  it('should fail when object not found', () => {
    const doc = makeDoc();
    const result = executeTool(
      'updateText',
      { objectId: 'nonexistent', newText: 'Hello' },
      doc,
      TEST_USER,
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('not found');
  });
});

// ---------------------------------------------------------------------------
// changeColor
// ---------------------------------------------------------------------------

describe('changeColor', () => {
  it('should change color of a sticky note', () => {
    const doc = makeDoc();
    seedObject(doc, makeSticky({ id: 'sticky-1', color: '#FFEB3B' }));

    const result = executeTool(
      'changeColor',
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
      'changeColor',
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
    seedObject(doc, makeConnector({ id: 'conn-1', start: { id: 'a', snapTo: 'auto' }, end: { id: 'b', snapTo: 'auto' }, stroke: '#666' }));

    const result = executeTool(
      'changeColor',
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
      parentId: null,
      title: 'F', fill: DEFAULT_FRAME_FILL,
      childrenIds: [],
    };
    seedObject(doc, frame);

    const result = executeTool(
      'changeColor',
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
      'changeColor',
      { objectId: 'nonexistent', color: '#000' },
      doc,
      TEST_USER,
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('not found');
  });
});

// ---------------------------------------------------------------------------
// Unknown tool
// ---------------------------------------------------------------------------

describe('unknown tool dispatch', () => {
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

describe('object limit enforcement', () => {
  it('should reject creation when board is at capacity', () => {
    const doc = makeDoc();
    const objectsMap = doc.getMap('objects');

    // Fill the board to capacity
    for (let i = 0; i < MAX_OBJECTS_PER_BOARD; i++) {
      objectsMap.set(`fill-${String(i)}`, makeSticky({ id: `fill-${String(i)}` }));
    }
    expect(objectCount(doc)).toBe(MAX_OBJECTS_PER_BOARD);

    // Try to create one more — each creation tool should fail
    const stickyResult = executeTool('createStickyNote', { text: 'Overflow', x: 0, y: 0 }, doc, TEST_USER);
    expect(stickyResult.success).toBe(false);
    expect(stickyResult.message).toContain('limit');

    const shapeResult = executeTool('createShape', { type: 'rectangle', x: 0, y: 0 }, doc, TEST_USER);
    expect(shapeResult.success).toBe(false);

    const frameResult = executeTool('createFrame', { title: 'F', x: 0, y: 0 }, doc, TEST_USER);
    expect(frameResult.success).toBe(false);

    // Connector also requires capacity
    const connResult = executeTool('createConnector', { fromId: 'fill-0', toId: 'fill-1' }, doc, TEST_USER);
    expect(connResult.success).toBe(false);

    // Count unchanged
    expect(objectCount(doc)).toBe(MAX_OBJECTS_PER_BOARD);
  });
});

// ---------------------------------------------------------------------------
// lastModifiedBy stamping
// ---------------------------------------------------------------------------

describe('user stamping', () => {
  it('should stamp lastModifiedBy on creation', () => {
    const doc = makeDoc();
    const result = executeTool(
      'createStickyNote',
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

    executeTool('moveObject', { objectId: 's1', x: 999, y: 999 }, doc, 'ai-user-456');

    const updated = getObject(doc, 's1') as StickyNote;
    expect(updated.lastModifiedBy).toBe('ai-user-456');
  });
});
