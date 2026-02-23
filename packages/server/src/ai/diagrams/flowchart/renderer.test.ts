/**
 * Flowchart Renderer Test Suite
 *
 * Tests the end-to-end rendering pipeline: plan → layout → board objects.
 * Uses real in-memory Y.Doc instances per project rules.
 */

import { describe, expect, it } from 'vitest';
import { Doc } from 'yjs';
import type {
  BoardObject,
  StickyNote,
  TextElement,
  Connector,
  FlowchartPlanV1,
} from '@collabboard/shared';
import { FLOWCHART_LAYOUT, FLOWCHART_NODE_COLORS } from '@collabboard/shared';
import { renderFlowchart } from './renderer.js';
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

function makeLinearPlan(overrides?: Partial<FlowchartPlanV1>): FlowchartPlanV1 {
  return {
    version: 1,
    diagramType: 'flowchart',
    title: 'Password Reset Flow',
    direction: 'TB',
    nodes: [
      { id: '1', label: 'User clicks Forgot Password', type: 'start' },
      { id: '2', label: 'Enter email', type: 'process' },
      { id: '3', label: 'Send reset email', type: 'process' },
      { id: '4', label: 'Success', type: 'end' },
    ],
    edges: [
      { from: '1', to: '2' },
      { from: '2', to: '3' },
      { from: '3', to: '4' },
    ],
    ...overrides,
  };
}

function makeBranchingPlan(): FlowchartPlanV1 {
  return {
    version: 1,
    diagramType: 'flowchart',
    title: 'Login Flow',
    direction: 'TB',
    nodes: [
      { id: 'start', label: 'Enter credentials', type: 'start' },
      { id: 'check', label: 'Credentials valid?', type: 'decision' },
      { id: 'ok', label: 'Dashboard', type: 'end' },
      { id: 'fail', label: 'Show error', type: 'end' },
    ],
    edges: [
      { from: 'start', to: 'check' },
      { from: 'check', to: 'ok', label: 'Yes' },
      { from: 'check', to: 'fail', label: 'No' },
    ],
  };
}

// ---------------------------------------------------------------------------
// Basic rendering
// ---------------------------------------------------------------------------

describe('renderFlowchart', () => {
  it('should create a title, sticky notes for nodes, and connectors for edges', () => {
    const doc = new Doc();
    const result = renderFlowchart(makeLinearPlan(), makeCtx(doc));

    expect(result.success).toBe(true);

    // 1 title text
    const texts = objectsByType(doc, 'text') as TextElement[];
    expect(texts).toHaveLength(1);
    expect(texts[0]!.text).toBe('Password Reset Flow');
    expect(texts[0]!.fontSize).toBe(FLOWCHART_LAYOUT.TITLE_FONT_SIZE);

    // 4 sticky notes (one per node)
    const stickies = objectsByType(doc, 'sticky') as StickyNote[];
    expect(stickies).toHaveLength(4);

    // 3 connectors
    const connectors = objectsByType(doc, 'connector') as Connector[];
    expect(connectors).toHaveLength(3);
  });

  it('should return all created IDs', () => {
    const doc = new Doc();
    const result = renderFlowchart(makeLinearPlan(), makeCtx(doc));
    const data = result.data as { createdIds: string[] };

    // 1 title + 4 stickies + 3 connectors = 8
    expect(data.createdIds).toHaveLength(8);

    const objectsMap = doc.getMap('objects');
    for (const id of data.createdIds) {
      expect(objectsMap.has(id)).toBe(true);
    }
  });

  it('should colour-code nodes by type', () => {
    const doc = new Doc();
    renderFlowchart(makeLinearPlan(), makeCtx(doc));

    const stickies = objectsByType(doc, 'sticky') as StickyNote[];
    const start = stickies.find((s) => s.text === 'User clicks Forgot Password');
    const process = stickies.find((s) => s.text === 'Enter email');
    const end = stickies.find((s) => s.text === 'Success');

    expect(start).toBeDefined();
    expect(process).toBeDefined();
    expect(end).toBeDefined();
    expect(start!.color).toBe(FLOWCHART_NODE_COLORS.start);
    expect(process!.color).toBe(FLOWCHART_NODE_COLORS.process);
    expect(end!.color).toBe(FLOWCHART_NODE_COLORS.end);
  });

  it('should stamp lastModifiedBy on all objects', () => {
    const doc = new Doc();
    renderFlowchart(makeLinearPlan(), makeCtx(doc));

    for (const obj of allObjects(doc)) {
      expect(obj.lastModifiedBy).toBe(TEST_USER);
    }
  });

  it('should produce a meaningful success message', () => {
    const doc = new Doc();
    const result = renderFlowchart(makeLinearPlan(), makeCtx(doc));
    expect(result.success).toBe(true);
    expect(result.message).toContain('Password Reset Flow');
    expect(result.message).toContain('4 nodes');
    expect(result.message).toContain('3 connections');
  });
});

// ---------------------------------------------------------------------------
// Connectors
// ---------------------------------------------------------------------------

describe('renderFlowchart connectors', () => {
  it('should create connectors with arrow end caps', () => {
    const doc = new Doc();
    renderFlowchart(makeLinearPlan(), makeCtx(doc));

    const connectors = objectsByType(doc, 'connector') as Connector[];
    for (const c of connectors) {
      expect(c.endCap).toBe('arrow');
      expect(c.style).toBe('straight');
    }
  });

  it('should connect the correct board objects', () => {
    const doc = new Doc();
    renderFlowchart(makeLinearPlan(), makeCtx(doc));

    const stickies = objectsByType(doc, 'sticky') as StickyNote[];
    const connectors = objectsByType(doc, 'connector') as Connector[];

    // Build a set of connected IDs
    const connectedFromIds = new Set(connectors.map((c) => c.start.id));
    const connectedToIds = new Set(connectors.map((c) => c.end.id));
    const stickyIds = new Set(stickies.map((s) => s.id));

    // All connector endpoints should reference existing stickies
    for (const id of connectedFromIds) {
      expect(stickyIds.has(id)).toBe(true);
    }
    for (const id of connectedToIds) {
      expect(stickyIds.has(id)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Edge labels
// ---------------------------------------------------------------------------

describe('renderFlowchart edge labels', () => {
  it('should create text elements for labeled edges', () => {
    const doc = new Doc();
    renderFlowchart(makeBranchingPlan(), makeCtx(doc));

    const texts = objectsByType(doc, 'text') as TextElement[];
    // 1 title + 2 edge labels ("Yes", "No")
    expect(texts).toHaveLength(3);

    const labels = texts.filter((t) => t.fontSize === FLOWCHART_LAYOUT.EDGE_LABEL_FONT_SIZE);
    expect(labels).toHaveLength(2);

    const labelTexts = labels.map((l) => l.text).sort();
    expect(labelTexts).toEqual(['No', 'Yes']);
  });

  it('should not create labels for unlabeled edges', () => {
    const doc = new Doc();
    renderFlowchart(makeLinearPlan(), makeCtx(doc));

    const texts = objectsByType(doc, 'text') as TextElement[];
    // Only the title — no edge labels
    expect(texts).toHaveLength(1);
  });

  it('should include edge label IDs in createdIds', () => {
    const doc = new Doc();
    const result = renderFlowchart(makeBranchingPlan(), makeCtx(doc));
    const data = result.data as { createdIds: string[] };

    // 1 title + 4 stickies + 3 connectors + 2 edge labels = 10
    expect(data.createdIds).toHaveLength(10);
  });
});

// ---------------------------------------------------------------------------
// Layout direction
// ---------------------------------------------------------------------------

describe('renderFlowchart direction', () => {
  it('TB: nodes should progress top to bottom', () => {
    const doc = new Doc();
    renderFlowchart(makeLinearPlan({ direction: 'TB' }), makeCtx(doc));

    const stickies = objectsByType(doc, 'sticky') as StickyNote[];
    const sorted = [...stickies].sort((a, b) => a.y - b.y);

    // First node should be the start
    expect(sorted[0]!.text).toBe('User clicks Forgot Password');
    // Last node should be the end
    expect(sorted[sorted.length - 1]!.text).toBe('Success');
  });

  it('LR: nodes should progress left to right', () => {
    const doc = new Doc();
    renderFlowchart(makeLinearPlan({ direction: 'LR' }), makeCtx(doc));

    const stickies = objectsByType(doc, 'sticky') as StickyNote[];
    const sorted = [...stickies].sort((a, b) => a.x - b.x);

    expect(sorted[0]!.text).toBe('User clicks Forgot Password');
    expect(sorted[sorted.length - 1]!.text).toBe('Success');
  });
});

// ---------------------------------------------------------------------------
// Decision branching
// ---------------------------------------------------------------------------

describe('renderFlowchart branching', () => {
  it('should create decision node with orange colour', () => {
    const doc = new Doc();
    renderFlowchart(makeBranchingPlan(), makeCtx(doc));

    const stickies = objectsByType(doc, 'sticky') as StickyNote[];
    const decision = stickies.find((s) => s.text === 'Credentials valid?');
    expect(decision).toBeDefined();
    expect(decision!.color).toBe(FLOWCHART_NODE_COLORS.decision);
  });

  it('should create two connectors from a decision node', () => {
    const doc = new Doc();
    renderFlowchart(makeBranchingPlan(), makeCtx(doc));

    const stickies = objectsByType(doc, 'sticky') as StickyNote[];
    const decision = stickies.find((s) => s.text === 'Credentials valid?');
    const connectors = objectsByType(doc, 'connector') as Connector[];

    const fromDecision = connectors.filter((c) => c.start.id === decision!.id);
    expect(fromDecision).toHaveLength(2);
  });

  it('should place branch targets at different positions', () => {
    const doc = new Doc();
    renderFlowchart(makeBranchingPlan(), makeCtx(doc));

    const stickies = objectsByType(doc, 'sticky') as StickyNote[];
    const ok = stickies.find((s) => s.text === 'Dashboard');
    const fail = stickies.find((s) => s.text === 'Show error');

    expect(ok).toBeDefined();
    expect(fail).toBeDefined();
    // They should be in the same layer but different x positions
    expect(ok!.y).toBe(fail!.y);
    expect(ok!.x).not.toBe(fail!.x);
  });
});
