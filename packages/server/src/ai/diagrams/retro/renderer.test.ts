/**
 * Retrospective Renderer Test Suite
 *
 * Tests the deterministic layout engine that converts a RetroPlanV1 into
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
  RetroPlanV1,
} from '@collabboard/shared';
import { RETRO_LAYOUT, RETRO_COLUMN_COLORS } from '@collabboard/shared';
import { renderRetro } from './renderer.js';
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

function makePlan(overrides?: Partial<RetroPlanV1>): RetroPlanV1 {
  return {
    version: 1,
    diagramType: 'retro',
    title: 'Sprint 12 Retro',
    columns: [
      {
        title: 'What Went Well',
        cards: [{ text: 'Great team collaboration' }, { text: 'Shipped on time' }],
      },
      {
        title: 'What To Improve',
        cards: [{ text: 'Too many meetings' }, { text: 'Flaky CI pipeline' }],
      },
      {
        title: 'Action Items',
        cards: [{ text: 'Reduce standups to 3x/week' }, { text: 'Fix CI flakes this sprint' }],
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Basic rendering
// ---------------------------------------------------------------------------

describe('renderRetro', () => {
  it('should create a title, column frames, and all cards', () => {
    const doc = new Doc();
    const plan = makePlan();
    const result = renderRetro(plan, makeCtx(doc));

    expect(result.success).toBe(true);

    // 1 title text
    const texts = objectsByType(doc, 'text') as TextElement[];
    expect(texts).toHaveLength(1);
    expect(texts[0]!.text).toBe('Sprint 12 Retro');
    expect(texts[0]!.fontSize).toBe(RETRO_LAYOUT.TITLE_FONT_SIZE);

    // 3 frames
    const frames = objectsByType(doc, 'frame') as Frame[];
    expect(frames).toHaveLength(3);
    const frameTitles = frames.map((f) => f.title).sort();
    expect(frameTitles).toEqual(['Action Items', 'What To Improve', 'What Went Well']);

    // 6 cards total (2+2+2)
    const stickies = objectsByType(doc, 'sticky') as StickyNote[];
    expect(stickies).toHaveLength(6);
  });

  it('should return created IDs in data', () => {
    const doc = new Doc();
    const result = renderRetro(makePlan(), makeCtx(doc));

    expect(result.success).toBe(true);
    const data = result.data as { createdIds: string[] };
    // 1 title + 3 frames + 6 cards = 10
    expect(data.createdIds).toHaveLength(10);

    const objectsMap = doc.getMap('objects');
    for (const id of data.createdIds) {
      expect(objectsMap.has(id)).toBe(true);
    }
  });

  it('should apply default retro column colours when plan omits color', () => {
    const doc = new Doc();
    const plan = makePlan({
      columns: [
        { title: 'Went Well', cards: [{ text: 'C1' }] },
        { title: 'Improve', cards: [{ text: 'C2' }] },
        { title: 'Actions', cards: [{ text: 'C3' }] },
      ],
    });
    renderRetro(plan, makeCtx(doc));

    const stickies = objectsByType(doc, 'sticky') as StickyNote[];
    expect(stickies).toHaveLength(3);

    const c1 = stickies.find((s) => s.text === 'C1');
    const c2 = stickies.find((s) => s.text === 'C2');
    const c3 = stickies.find((s) => s.text === 'C3');

    expect(c1).toBeDefined();
    expect(c2).toBeDefined();
    expect(c3).toBeDefined();
    // green, orange, blue — classic retro order
    expect(c1!.color).toBe(RETRO_COLUMN_COLORS[0]); // green
    expect(c2!.color).toBe(RETRO_COLUMN_COLORS[1]); // orange
    expect(c3!.color).toBe(RETRO_COLUMN_COLORS[2]); // blue
  });

  it('should respect explicit card colours from the plan', () => {
    const doc = new Doc();
    const plan = makePlan({
      columns: [
        { title: 'Col', cards: [{ text: 'Custom', color: '#9C27B0' }] },
        { title: 'Col2', cards: [{ text: 'Default' }] },
      ],
    });
    renderRetro(plan, makeCtx(doc));

    const stickies = objectsByType(doc, 'sticky') as StickyNote[];
    const custom = stickies.find((s) => s.text === 'Custom');
    expect(custom!.color).toBe('#9C27B0');
  });

  it('should respect explicit column colour for all cards in that column', () => {
    const doc = new Doc();
    const plan = makePlan({
      columns: [
        { title: 'Urgent', color: '#E91E63', cards: [{ text: 'A' }, { text: 'B' }] },
        { title: 'Other', cards: [{ text: 'C' }] },
      ],
    });
    renderRetro(plan, makeCtx(doc));

    const stickies = objectsByType(doc, 'sticky') as StickyNote[];
    const a = stickies.find((s) => s.text === 'A');
    const b = stickies.find((s) => s.text === 'B');
    expect(a!.color).toBe('#E91E63');
    expect(b!.color).toBe('#E91E63');
  });
});

// ---------------------------------------------------------------------------
// Layout correctness
// ---------------------------------------------------------------------------

describe('renderRetro layout', () => {
  it('should center the board around the viewport center', () => {
    const doc = new Doc();
    const cx = 1000;
    const cy = 800;
    renderRetro(makePlan(), makeCtx(doc, { x: cx, y: cy }));

    const texts = objectsByType(doc, 'text') as TextElement[];
    const frames = objectsByType(doc, 'frame') as Frame[];

    const boardW = 3 * RETRO_LAYOUT.COLUMN_WIDTH + 2 * RETRO_LAYOUT.COLUMN_GAP;
    const originX = cx - boardW / 2;

    expect(texts[0]!.x).toBe(originX);

    for (const f of frames) {
      expect(f.x).toBeGreaterThanOrEqual(originX);
      expect(f.x).toBeLessThanOrEqual(originX + boardW);
    }
  });

  it('should arrange columns horizontally with consistent gaps', () => {
    const doc = new Doc();
    renderRetro(makePlan(), makeCtx(doc));

    const frames = objectsByType(doc, 'frame') as Frame[];
    expect(frames).toHaveLength(3);

    frames.sort((a, b) => a.x - b.x);

    // All at the same y
    expect(frames[0]!.y).toBe(frames[1]!.y);
    expect(frames[1]!.y).toBe(frames[2]!.y);

    // Consistent column spacing
    const gap1 = frames[1]!.x - frames[0]!.x;
    const gap2 = frames[2]!.x - frames[1]!.x;
    expect(gap1).toBe(RETRO_LAYOUT.COLUMN_WIDTH + RETRO_LAYOUT.COLUMN_GAP);
    expect(gap2).toBe(gap1);
  });

  it('should stack cards vertically inside each column', () => {
    const doc = new Doc();
    const plan = makePlan({
      columns: [
        { title: 'Col', cards: [{ text: 'A' }, { text: 'B' }, { text: 'C' }] },
        { title: 'Col2', cards: [] },
      ],
    });
    renderRetro(plan, makeCtx(doc));

    const stickies = objectsByType(doc, 'sticky') as StickyNote[];
    expect(stickies).toHaveLength(3);

    const sorted = [...stickies].sort((a, b) => a.y - b.y);
    expect(sorted[0]!.x).toBe(sorted[1]!.x);
    expect(sorted[1]!.x).toBe(sorted[2]!.x);

    expect(sorted[1]!.y - sorted[0]!.y).toBe(RETRO_LAYOUT.STICKY_SIZE + RETRO_LAYOUT.GAP);
    expect(sorted[2]!.y - sorted[1]!.y).toBe(RETRO_LAYOUT.STICKY_SIZE + RETRO_LAYOUT.GAP);
  });

  it('should give all columns the same height (tallest column wins)', () => {
    const doc = new Doc();
    const plan = makePlan({
      columns: [
        {
          title: 'Many',
          cards: [{ text: '1' }, { text: '2' }, { text: '3' }, { text: '4' }, { text: '5' }],
        },
        { title: 'Few', cards: [{ text: 'A' }] },
      ],
    });
    renderRetro(plan, makeCtx(doc));

    const frames = objectsByType(doc, 'frame') as Frame[];
    expect(frames).toHaveLength(2);
    expect(frames[0]!.height).toBe(frames[1]!.height);
    expect(frames[0]!.height).toBeGreaterThan(RETRO_LAYOUT.MIN_COLUMN_HEIGHT);
  });

  it('should use minimum height when columns have few cards', () => {
    const doc = new Doc();
    const plan = makePlan({
      columns: [
        { title: 'A', cards: [] },
        { title: 'B', cards: [{ text: 'X' }] },
      ],
    });
    renderRetro(plan, makeCtx(doc));

    const frames = objectsByType(doc, 'frame') as Frame[];
    expect(frames[0]!.height).toBe(RETRO_LAYOUT.MIN_COLUMN_HEIGHT);
  });

  it('should place all columns at the same width', () => {
    const doc = new Doc();
    renderRetro(makePlan(), makeCtx(doc));

    const frames = objectsByType(doc, 'frame') as Frame[];
    for (const f of frames) {
      expect(f.width).toBe(RETRO_LAYOUT.COLUMN_WIDTH);
    }
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('renderRetro edge cases', () => {
  it('should handle empty columns', () => {
    const doc = new Doc();
    const plan = makePlan({
      columns: [
        { title: 'Empty A', cards: [] },
        { title: 'Empty B', cards: [] },
      ],
    });
    const result = renderRetro(plan, makeCtx(doc));

    expect(result.success).toBe(true);
    // 1 title + 2 frames + 0 cards
    expect(allObjects(doc)).toHaveLength(3);
  });

  it('should handle 4L format (4 columns)', () => {
    const doc = new Doc();
    const plan = makePlan({
      title: '4Ls Retro',
      columns: [
        { title: 'Liked', cards: [{ text: 'X' }] },
        { title: 'Learned', cards: [{ text: 'Y' }] },
        { title: 'Lacked', cards: [{ text: 'Z' }] },
        { title: 'Longed For', cards: [{ text: 'W' }] },
      ],
    });
    const result = renderRetro(plan, makeCtx(doc));

    expect(result.success).toBe(true);
    const frames = objectsByType(doc, 'frame') as Frame[];
    expect(frames).toHaveLength(4);
    expect(objectsByType(doc, 'sticky')).toHaveLength(4);
  });

  it('should stamp lastModifiedBy on all created objects', () => {
    const doc = new Doc();
    renderRetro(makePlan(), makeCtx(doc));

    for (const obj of allObjects(doc)) {
      expect(obj.lastModifiedBy).toBe(TEST_USER);
    }
  });

  it('should produce a meaningful message on success', () => {
    const doc = new Doc();
    const result = renderRetro(makePlan(), makeCtx(doc));

    expect(result.success).toBe(true);
    expect(result.message).toContain('Sprint 12 Retro');
    expect(result.message).toContain('3 columns');
    expect(result.message).toContain('6 cards');
  });
});
