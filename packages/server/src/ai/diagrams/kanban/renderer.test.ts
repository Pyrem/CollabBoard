/**
 * Kanban Renderer Test Suite
 *
 * Tests the deterministic layout engine that converts a KanbanPlanV1 into
 * board objects via executeTool against real Yjs documents.
 *
 * Following the project rule: "Never mock Yjs in tests — use real
 * in-memory Y.Doc instances."
 */

import { describe, expect, it } from 'vitest';
import { Doc } from 'yjs';
import type {
  BoardObject,
  StickyNote,
  TextElement,
  Frame,
  KanbanPlanV1,
} from '@collabboard/shared';
import { KANBAN_LAYOUT, KANBAN_COLUMN_COLORS } from '@collabboard/shared';
import { renderKanban } from './renderer.js';
import type { RenderContext } from '../types.js';

const TEST_USER = 'test-user';
const CENTER = { x: 960, y: 540 };

function makeCtx(doc: Doc, viewportCenter = CENTER): RenderContext {
  return { doc, userId: TEST_USER, viewportCenter };
}

function allObjects(doc: Doc): BoardObject[] {
  const result: BoardObject[] = [];
  doc.getMap('objects').forEach((v) => result.push(v as BoardObject));
  return result;
}

function objectsByType(doc: Doc, type: string): BoardObject[] {
  return allObjects(doc).filter((o) => o.type === type);
}

function makePlan(overrides?: Partial<KanbanPlanV1>): KanbanPlanV1 {
  return {
    version: 1,
    diagramType: 'kanban',
    title: 'Sprint Board',
    columns: [
      { title: 'To Do', cards: [{ text: 'Task A' }, { text: 'Task B' }] },
      { title: 'In Progress', cards: [{ text: 'Task C' }] },
      { title: 'Done', cards: [{ text: 'Task D' }, { text: 'Task E' }, { text: 'Task F' }] },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Basic rendering
// ---------------------------------------------------------------------------

describe('renderKanban', () => {
  it('should create a title, column frames, and all cards', () => {
    const doc = new Doc();
    const plan = makePlan();
    const result = renderKanban(plan, makeCtx(doc));

    expect(result.success).toBe(true);

    // 1 title text
    const texts = objectsByType(doc, 'text') as TextElement[];
    expect(texts).toHaveLength(1);
    expect(texts[0]!.text).toBe('Sprint Board');
    expect(texts[0]!.fontSize).toBe(KANBAN_LAYOUT.TITLE_FONT_SIZE);

    // 3 frames
    const frames = objectsByType(doc, 'frame') as Frame[];
    expect(frames).toHaveLength(3);
    const frameTitles = frames.map((f) => f.title).sort();
    expect(frameTitles).toEqual(['Done', 'In Progress', 'To Do']);

    // 6 cards total (2+1+3)
    const stickies = objectsByType(doc, 'sticky') as StickyNote[];
    expect(stickies).toHaveLength(6);
  });

  it('should return created IDs in data', () => {
    const doc = new Doc();
    const result = renderKanban(makePlan(), makeCtx(doc));

    expect(result.success).toBe(true);
    const data = result.data as { createdIds: string[] };
    // 1 title + 3 frames + 6 cards = 10
    expect(data.createdIds).toHaveLength(10);

    const objectsMap = doc.getMap('objects');
    for (const id of data.createdIds) {
      expect(objectsMap.has(id)).toBe(true);
    }
  });

  it('should apply default column colours when plan omits color', () => {
    const doc = new Doc();
    const plan = makePlan({
      columns: [
        { title: 'Col A', cards: [{ text: 'C1' }] },
        { title: 'Col B', cards: [{ text: 'C2' }] },
      ],
    });
    renderKanban(plan, makeCtx(doc));

    const stickies = objectsByType(doc, 'sticky') as StickyNote[];
    expect(stickies).toHaveLength(2);

    const c1 = stickies.find((s) => s.text === 'C1');
    const c2 = stickies.find((s) => s.text === 'C2');

    expect(c1).toBeDefined();
    expect(c2).toBeDefined();
    expect(c1!.color).toBe(KANBAN_COLUMN_COLORS[0]);
    expect(c2!.color).toBe(KANBAN_COLUMN_COLORS[1]);
  });

  it('should respect explicit card colours from the plan', () => {
    const doc = new Doc();
    const plan = makePlan({
      columns: [
        { title: 'Col', cards: [{ text: 'Custom', color: '#9C27B0' }] },
      ],
    });
    renderKanban(plan, makeCtx(doc));

    const stickies = objectsByType(doc, 'sticky') as StickyNote[];
    expect(stickies).toHaveLength(1);
    expect(stickies[0]!.color).toBe('#9C27B0');
  });

  it('should respect explicit column colour for all cards in that column', () => {
    const doc = new Doc();
    const plan = makePlan({
      columns: [
        { title: 'Urgent', color: '#E91E63', cards: [{ text: 'A' }, { text: 'B' }] },
      ],
    });
    renderKanban(plan, makeCtx(doc));

    const stickies = objectsByType(doc, 'sticky') as StickyNote[];
    expect(stickies).toHaveLength(2);
    for (const s of stickies) {
      expect(s.color).toBe('#E91E63');
    }
  });
});

// ---------------------------------------------------------------------------
// Layout correctness
// ---------------------------------------------------------------------------

describe('renderKanban layout', () => {
  it('should center the board around the viewport center', () => {
    const doc = new Doc();
    const cx = 1000;
    const cy = 800;
    renderKanban(makePlan(), makeCtx(doc, { x: cx, y: cy }));

    const texts = objectsByType(doc, 'text') as TextElement[];
    const frames = objectsByType(doc, 'frame') as Frame[];

    const boardW = 3 * KANBAN_LAYOUT.COLUMN_WIDTH + 2 * KANBAN_LAYOUT.COLUMN_GAP;
    const originX = cx - boardW / 2;

    expect(texts[0]!.x).toBe(originX);

    for (const f of frames) {
      expect(f.x).toBeGreaterThanOrEqual(originX);
      expect(f.x).toBeLessThanOrEqual(originX + boardW);
    }
  });

  it('should arrange columns horizontally with consistent gaps', () => {
    const doc = new Doc();
    renderKanban(makePlan(), makeCtx(doc));

    const frames = objectsByType(doc, 'frame') as Frame[];
    expect(frames).toHaveLength(3);

    // Sort by x position
    frames.sort((a, b) => a.x - b.x);

    // All at the same y
    expect(frames[0]!.y).toBe(frames[1]!.y);
    expect(frames[1]!.y).toBe(frames[2]!.y);

    // Consistent column gap
    const gap1 = frames[1]!.x - frames[0]!.x;
    const gap2 = frames[2]!.x - frames[1]!.x;
    expect(gap1).toBe(KANBAN_LAYOUT.COLUMN_WIDTH + KANBAN_LAYOUT.COLUMN_GAP);
    expect(gap2).toBe(gap1);
  });

  it('should stack cards vertically inside each column', () => {
    const doc = new Doc();
    const plan = makePlan({
      columns: [
        { title: 'Col', cards: [{ text: 'A' }, { text: 'B' }, { text: 'C' }] },
      ],
    });
    renderKanban(plan, makeCtx(doc));

    const stickies = objectsByType(doc, 'sticky') as StickyNote[];
    expect(stickies).toHaveLength(3);

    // All same x (single column of cards)
    const sorted = [...stickies].sort((a, b) => a.y - b.y);
    expect(sorted[0]!.x).toBe(sorted[1]!.x);
    expect(sorted[1]!.x).toBe(sorted[2]!.x);

    // Vertical spacing = STICKY_SIZE + GAP = 224
    expect(sorted[1]!.y - sorted[0]!.y).toBe(KANBAN_LAYOUT.STICKY_SIZE + KANBAN_LAYOUT.GAP);
    expect(sorted[2]!.y - sorted[1]!.y).toBe(KANBAN_LAYOUT.STICKY_SIZE + KANBAN_LAYOUT.GAP);
  });

  it('should give all columns the same height (tallest column wins)', () => {
    const doc = new Doc();
    // Column 1 has 5 cards, column 2 has 1 — both should match tallest
    const plan = makePlan({
      columns: [
        { title: 'Many', cards: [{ text: '1' }, { text: '2' }, { text: '3' }, { text: '4' }, { text: '5' }] },
        { title: 'Few', cards: [{ text: 'A' }] },
      ],
    });
    renderKanban(plan, makeCtx(doc));

    const frames = objectsByType(doc, 'frame') as Frame[];
    expect(frames).toHaveLength(2);
    expect(frames[0]!.height).toBe(frames[1]!.height);
    // 5 cards needs more than MIN_COLUMN_HEIGHT
    expect(frames[0]!.height).toBeGreaterThan(KANBAN_LAYOUT.MIN_COLUMN_HEIGHT);
  });

  it('should use minimum height when columns have few cards', () => {
    const doc = new Doc();
    const plan = makePlan({
      columns: [
        { title: 'A', cards: [] },
        { title: 'B', cards: [{ text: 'X' }] },
      ],
    });
    renderKanban(plan, makeCtx(doc));

    const frames = objectsByType(doc, 'frame') as Frame[];
    expect(frames[0]!.height).toBe(KANBAN_LAYOUT.MIN_COLUMN_HEIGHT);
  });

  it('should place all columns at the same width', () => {
    const doc = new Doc();
    renderKanban(makePlan(), makeCtx(doc));

    const frames = objectsByType(doc, 'frame') as Frame[];
    for (const f of frames) {
      expect(f.width).toBe(KANBAN_LAYOUT.COLUMN_WIDTH);
    }
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('renderKanban edge cases', () => {
  it('should handle empty columns', () => {
    const doc = new Doc();
    const plan = makePlan({
      columns: [
        { title: 'Empty A', cards: [] },
        { title: 'Empty B', cards: [] },
      ],
    });
    const result = renderKanban(plan, makeCtx(doc));

    expect(result.success).toBe(true);
    // 1 title + 2 frames + 0 cards
    expect(allObjects(doc)).toHaveLength(3);
  });

  it('should handle many columns', () => {
    const doc = new Doc();
    const plan = makePlan({
      columns: [
        { title: 'Backlog', cards: [{ text: 'X' }] },
        { title: 'Ready', cards: [{ text: 'Y' }] },
        { title: 'In Progress', cards: [] },
        { title: 'Review', cards: [{ text: 'Z' }] },
        { title: 'Done', cards: [] },
      ],
    });
    const result = renderKanban(plan, makeCtx(doc));

    expect(result.success).toBe(true);
    const frames = objectsByType(doc, 'frame') as Frame[];
    expect(frames).toHaveLength(5);
    expect(objectsByType(doc, 'sticky')).toHaveLength(3);
  });

  it('should stamp lastModifiedBy on all created objects', () => {
    const doc = new Doc();
    renderKanban(makePlan(), makeCtx(doc));

    for (const obj of allObjects(doc)) {
      expect(obj.lastModifiedBy).toBe(TEST_USER);
    }
  });

  it('should produce a meaningful message on success', () => {
    const doc = new Doc();
    const result = renderKanban(makePlan(), makeCtx(doc));

    expect(result.success).toBe(true);
    expect(result.message).toContain('Sprint Board');
    expect(result.message).toContain('3 columns');
    expect(result.message).toContain('6 cards');
  });
});
