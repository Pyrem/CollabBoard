/**
 * SWOT Renderer Test Suite
 *
 * Tests the deterministic layout engine that converts a SWOTPlanV1 into
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
  SWOTPlanV1,
} from '@collabboard/shared';
import { SWOT_LAYOUT, SWOT_DEFAULT_COLORS } from '@collabboard/shared';
import { renderSwot } from './renderer.js';
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

function makePlan(overrides?: Partial<SWOTPlanV1>): SWOTPlanV1 {
  return {
    version: 1,
    diagramType: 'swot',
    title: 'SWOT: Test Business',
    strengths: [{ text: 'Strong brand' }, { text: 'Good team' }],
    weaknesses: [{ text: 'Limited budget' }],
    opportunities: [{ text: 'Growing market' }, { text: 'New partnerships' }, { text: 'Tech trends' }],
    threats: [{ text: 'Competition' }, { text: 'Regulation' }],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Basic rendering
// ---------------------------------------------------------------------------

describe('renderSwot', () => {
  it('should create a title, 4 frames, and all stickies', () => {
    const doc = new Doc();
    const plan = makePlan();
    const result = renderSwot(plan, makeCtx(doc));

    expect(result.success).toBe(true);

    // 1 title text
    const texts = objectsByType(doc, 'text') as TextElement[];
    expect(texts).toHaveLength(1);
    expect(texts[0]!.text).toBe('SWOT: Test Business');
    expect(texts[0]!.fontSize).toBe(SWOT_LAYOUT.TITLE_FONT_SIZE);

    // 4 frames
    const frames = objectsByType(doc, 'frame') as Frame[];
    expect(frames).toHaveLength(4);
    const frameTitles = frames.map((f) => f.title).sort();
    expect(frameTitles).toEqual(['Opportunities', 'Strengths', 'Threats', 'Weaknesses']);

    // 8 stickies total (2+1+3+2)
    const stickies = objectsByType(doc, 'sticky') as StickyNote[];
    expect(stickies).toHaveLength(8);
  });

  it('should return created IDs in data', () => {
    const doc = new Doc();
    const result = renderSwot(makePlan(), makeCtx(doc));

    expect(result.success).toBe(true);
    const data = result.data as { createdIds: string[] };
    // 1 title + 4 frames + 8 stickies = 13
    expect(data.createdIds).toHaveLength(13);

    // Every ID should exist in the Yjs map
    const objectsMap = doc.getMap('objects');
    for (const id of data.createdIds) {
      expect(objectsMap.has(id)).toBe(true);
    }
  });

  it('should apply default quadrant colours when plan omits color', () => {
    const doc = new Doc();
    const plan = makePlan({
      strengths: [{ text: 'S1' }],
      weaknesses: [{ text: 'W1' }],
      opportunities: [{ text: 'O1' }],
      threats: [{ text: 'T1' }],
    });
    renderSwot(plan, makeCtx(doc));

    const stickies = objectsByType(doc, 'sticky') as StickyNote[];
    expect(stickies).toHaveLength(4);

    // Find by text content
    const s1 = stickies.find((s) => s.text === 'S1');
    const w1 = stickies.find((s) => s.text === 'W1');
    const o1 = stickies.find((s) => s.text === 'O1');
    const t1 = stickies.find((s) => s.text === 'T1');

    expect(s1).toBeDefined();
    expect(w1).toBeDefined();
    expect(o1).toBeDefined();
    expect(t1).toBeDefined();
    expect(s1!.color).toBe(SWOT_DEFAULT_COLORS['strengths']);
    expect(w1!.color).toBe(SWOT_DEFAULT_COLORS['weaknesses']);
    expect(o1!.color).toBe(SWOT_DEFAULT_COLORS['opportunities']);
    expect(t1!.color).toBe(SWOT_DEFAULT_COLORS['threats']);
  });

  it('should respect explicit sticky colours from the plan', () => {
    const doc = new Doc();
    const plan = makePlan({
      strengths: [{ text: 'Custom', color: '#9C27B0' }],
      weaknesses: [],
      opportunities: [],
      threats: [],
    });
    renderSwot(plan, makeCtx(doc));

    const stickies = objectsByType(doc, 'sticky') as StickyNote[];
    expect(stickies).toHaveLength(1);
    expect(stickies[0]!.color).toBe('#9C27B0');
  });
});

// ---------------------------------------------------------------------------
// Layout correctness
// ---------------------------------------------------------------------------

describe('renderSwot layout', () => {
  it('should center the diagram around the viewport center', () => {
    const doc = new Doc();
    const cx = 1000;
    const cy = 800;
    renderSwot(makePlan(), makeCtx(doc, { x: cx, y: cy }));

    const texts = objectsByType(doc, 'text') as TextElement[];
    const frames = objectsByType(doc, 'frame') as Frame[];

    // Board width = 2 * 560 + 40 = 1160
    const boardW = 2 * SWOT_LAYOUT.QUAD_WIDTH + SWOT_LAYOUT.QUAD_GAP;
    const originX = cx - boardW / 2;

    // Title should be at originX
    expect(texts[0]!.x).toBe(originX);

    // All frames should be within the board bounding box
    for (const f of frames) {
      expect(f.x).toBeGreaterThanOrEqual(originX);
      expect(f.x).toBeLessThanOrEqual(originX + boardW);
    }
  });

  it('should place frames in a 2x2 grid', () => {
    const doc = new Doc();
    renderSwot(makePlan({ strengths: [], weaknesses: [], opportunities: [], threats: [] }), makeCtx(doc));

    const frames = objectsByType(doc, 'frame') as Frame[];
    expect(frames).toHaveLength(4);

    // Sort by position: TL, TR, BL, BR
    frames.sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));

    const tl = frames[0]!;
    const tr = frames[1]!;
    const bl = frames[2]!;
    const br = frames[3]!;

    // Top row: same y
    expect(tl.y).toBe(tr.y);
    // Bottom row: same y
    expect(bl.y).toBe(br.y);
    // Left column: same x
    expect(tl.x).toBe(bl.x);
    // Right column: same x
    expect(tr.x).toBe(br.x);
    // Gap between columns
    expect(tr.x - tl.x).toBe(SWOT_LAYOUT.QUAD_WIDTH + SWOT_LAYOUT.QUAD_GAP);
    // Gap between rows
    expect(bl.y - tl.y).toBe(SWOT_LAYOUT.QUAD_HEIGHT + SWOT_LAYOUT.QUAD_GAP);
  });

  it('should pack stickies in a grid inside each frame', () => {
    const doc = new Doc();
    const plan = makePlan({
      strengths: [{ text: 'A' }, { text: 'B' }, { text: 'C' }, { text: 'D' }],
      weaknesses: [],
      opportunities: [],
      threats: [],
    });
    renderSwot(plan, makeCtx(doc));

    const frames = objectsByType(doc, 'frame') as Frame[];
    const stickies = objectsByType(doc, 'sticky') as StickyNote[];

    // Find the Strengths frame
    const strengthsFrame = frames.find((f) => f.title === 'Strengths');
    expect(strengthsFrame).toBeDefined();

    // All 4 stickies should be inside the frame bounds
    const innerX = strengthsFrame!.x + SWOT_LAYOUT.FRAME_PAD;
    const innerY = strengthsFrame!.y + SWOT_LAYOUT.FRAME_TITLE_OFFSET;

    for (const s of stickies) {
      expect(s.x).toBeGreaterThanOrEqual(innerX);
      expect(s.y).toBeGreaterThanOrEqual(innerY);
    }

    // With QUAD_WIDTH=560, FRAME_PAD=32, usable=496, columns = floor((496+24)/224) = 2
    // 4 stickies -> 2 rows x 2 cols
    // Row 0: A at col 0, B at col 1
    // Row 1: C at col 0, D at col 1
    const sorted = [...stickies].sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
    // First two should be on the same row
    expect(sorted[0]!.y).toBe(sorted[1]!.y);
    // Last two should be on the same row
    expect(sorted[2]!.y).toBe(sorted[3]!.y);
    // Column spacing = STICKY_SIZE + GAP = 224
    expect(sorted[1]!.x - sorted[0]!.x).toBe(SWOT_LAYOUT.STICKY_SIZE + SWOT_LAYOUT.GAP);
  });

  it('should auto-grow frame height when many stickies', () => {
    const doc = new Doc();
    // 7 stickies in strengths -> 4 rows with 2 columns -> needs more than 560
    const plan = makePlan({
      strengths: [
        { text: '1' }, { text: '2' }, { text: '3' }, { text: '4' },
        { text: '5' }, { text: '6' }, { text: '7' },
      ],
      weaknesses: [{ text: 'W1' }],
      opportunities: [],
      threats: [],
    });
    renderSwot(plan, makeCtx(doc));

    const frames = objectsByType(doc, 'frame') as Frame[];
    const strengthsFrame = frames.find((f) => f.title === 'Strengths');
    const weaknessesFrame = frames.find((f) => f.title === 'Weaknesses');

    expect(strengthsFrame).toBeDefined();
    expect(weaknessesFrame).toBeDefined();

    // 7 stickies, 2 columns -> 4 rows
    // Height = 80 + 4*(200+24) - 24 + 32 = 80 + 896 - 24 + 32 = 984
    expect(strengthsFrame!.height).toBeGreaterThan(SWOT_LAYOUT.QUAD_HEIGHT);

    // Both top-row frames should have the same height (row max)
    expect(strengthsFrame!.height).toBe(weaknessesFrame!.height);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('renderSwot edge cases', () => {
  it('should handle empty quadrants', () => {
    const doc = new Doc();
    const plan = makePlan({
      strengths: [],
      weaknesses: [],
      opportunities: [],
      threats: [],
    });
    const result = renderSwot(plan, makeCtx(doc));

    expect(result.success).toBe(true);
    // 1 title + 4 frames + 0 stickies
    expect(allObjects(doc)).toHaveLength(5);
  });

  it('should handle a single sticky per quadrant', () => {
    const doc = new Doc();
    const plan = makePlan({
      strengths: [{ text: 'S' }],
      weaknesses: [{ text: 'W' }],
      opportunities: [{ text: 'O' }],
      threats: [{ text: 'T' }],
    });
    const result = renderSwot(plan, makeCtx(doc));

    expect(result.success).toBe(true);
    // 1 title + 4 frames + 4 stickies
    expect(allObjects(doc)).toHaveLength(9);
  });

  it('should stamp lastModifiedBy on all created objects', () => {
    const doc = new Doc();
    renderSwot(makePlan(), makeCtx(doc));

    for (const obj of allObjects(doc)) {
      expect(obj.lastModifiedBy).toBe(TEST_USER);
    }
  });

  it('should produce a meaningful message on success', () => {
    const doc = new Doc();
    const result = renderSwot(makePlan(), makeCtx(doc));

    expect(result.success).toBe(true);
    expect(result.message).toContain('SWOT: Test Business');
    expect(result.message).toContain('4 frames');
    expect(result.message).toContain('8 sticky notes');
  });
});
