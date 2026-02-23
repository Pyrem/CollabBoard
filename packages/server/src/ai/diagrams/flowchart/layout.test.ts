/**
 * Layout Algorithm Test Suite
 *
 * Tests the layered graph drawing engine independently from the
 * renderer, verifying layer assignment, ordering, and coordinate
 * computation for various graph topologies.
 */

import { describe, expect, it } from 'vitest';
import type { FlowchartNode, FlowchartEdge } from '@collabboard/shared';
import { FLOWCHART_LAYOUT } from '@collabboard/shared';
import { computeFlowchartLayout, edgeLabelPosition } from './layout.js';

// ── Helpers ──────────────────────────────────────────────────────────

function node(id: string, type: FlowchartNode['type'] = 'process'): FlowchartNode {
  return { id, label: id, type };
}

function edge(from: string, to: string): FlowchartEdge {
  return { from, to };
}

// ─── Linear chain ───────────────────────────────────────────────────

describe('computeFlowchartLayout — linear chain', () => {
  // A → B → C (3 nodes, 2 edges)
  const nodes = [node('A', 'start'), node('B'), node('C', 'end')];
  const edges = [edge('A', 'B'), edge('B', 'C')];

  it('should assign all nodes a position', () => {
    const pos = computeFlowchartLayout(nodes, edges, 'TB');
    expect(pos.size).toBe(3);
    expect(pos.has('A')).toBe(true);
    expect(pos.has('B')).toBe(true);
    expect(pos.has('C')).toBe(true);
  });

  it('TB: nodes should have increasing y (top to bottom)', () => {
    const pos = computeFlowchartLayout(nodes, edges, 'TB');
    expect(pos.get('A')!.y).toBeLessThan(pos.get('B')!.y);
    expect(pos.get('B')!.y).toBeLessThan(pos.get('C')!.y);
  });

  it('TB: nodes in a chain should share the same x', () => {
    const pos = computeFlowchartLayout(nodes, edges, 'TB');
    expect(pos.get('A')!.x).toBe(pos.get('B')!.x);
    expect(pos.get('B')!.x).toBe(pos.get('C')!.x);
  });

  it('LR: nodes should have increasing x (left to right)', () => {
    const pos = computeFlowchartLayout(nodes, edges, 'LR');
    expect(pos.get('A')!.x).toBeLessThan(pos.get('B')!.x);
    expect(pos.get('B')!.x).toBeLessThan(pos.get('C')!.x);
  });

  it('LR: nodes in a chain should share the same y', () => {
    const pos = computeFlowchartLayout(nodes, edges, 'LR');
    expect(pos.get('A')!.y).toBe(pos.get('B')!.y);
    expect(pos.get('B')!.y).toBe(pos.get('C')!.y);
  });

  it('should space layers correctly', () => {
    const pos = computeFlowchartLayout(nodes, edges, 'TB');
    const step = FLOWCHART_LAYOUT.NODE_SIZE + FLOWCHART_LAYOUT.LAYER_GAP;
    const yA = pos.get('A')!.y;
    const yB = pos.get('B')!.y;
    const yC = pos.get('C')!.y;
    expect(yB - yA).toBe(step);
    expect(yC - yB).toBe(step);
  });
});

// ─── Diamond (decision branching) ───────────────────────────────────

describe('computeFlowchartLayout — diamond', () => {
  //     A
  //    / \
  //   B   C
  //    \ /
  //     D
  const nodes = [node('A', 'decision'), node('B'), node('C'), node('D', 'end')];
  const edges = [edge('A', 'B'), edge('A', 'C'), edge('B', 'D'), edge('C', 'D')];

  it('should place B and C in the same layer', () => {
    const pos = computeFlowchartLayout(nodes, edges, 'TB');
    expect(pos.get('B')!.y).toBe(pos.get('C')!.y);
  });

  it('should place D below B and C (longest path)', () => {
    const pos = computeFlowchartLayout(nodes, edges, 'TB');
    expect(pos.get('D')!.y).toBeGreaterThan(pos.get('B')!.y);
  });

  it('should place A above B and C', () => {
    const pos = computeFlowchartLayout(nodes, edges, 'TB');
    expect(pos.get('A')!.y).toBeLessThan(pos.get('B')!.y);
  });

  it('B and C should have different x positions', () => {
    const pos = computeFlowchartLayout(nodes, edges, 'TB');
    expect(pos.get('B')!.x).not.toBe(pos.get('C')!.x);
  });

  it('A and D should be centered between B and C', () => {
    const pos = computeFlowchartLayout(nodes, edges, 'TB');
    const midX = (pos.get('B')!.x + pos.get('C')!.x) / 2;
    // A is a solo node in layer 0 → centered at 0 (same as midpoint of B,C)
    expect(pos.get('A')!.x).toBe(midX);
    // D is a solo node in its layer → also centered
    expect(pos.get('D')!.x).toBe(midX);
  });
});

// ─── Disconnected components ────────────────────────────────────────

describe('computeFlowchartLayout — disconnected', () => {
  // Two independent chains: A→B and C→D
  const nodes = [node('A'), node('B'), node('C'), node('D')];
  const edges = [edge('A', 'B'), edge('C', 'D')];

  it('should assign positions to all nodes', () => {
    const pos = computeFlowchartLayout(nodes, edges, 'TB');
    expect(pos.size).toBe(4);
  });

  it('should keep chains in separate columns', () => {
    const pos = computeFlowchartLayout(nodes, edges, 'TB');
    // A and C should be in the same layer (both roots) but different x
    expect(pos.get('A')!.y).toBe(pos.get('C')!.y);
    expect(pos.get('A')!.x).not.toBe(pos.get('C')!.x);
  });
});

// ─── Single node ────────────────────────────────────────────────────

describe('computeFlowchartLayout — edge cases', () => {
  it('should handle 2 nodes with 1 edge', () => {
    const pos = computeFlowchartLayout([node('A'), node('B')], [edge('A', 'B')], 'TB');
    expect(pos.size).toBe(2);
  });

  it('should handle edges referencing non-existent nodes gracefully', () => {
    const pos = computeFlowchartLayout(
      [node('A'), node('B')],
      [edge('A', 'B'), edge('X', 'Y')], // X and Y don't exist
      'TB',
    );
    expect(pos.size).toBe(2);
    expect(pos.has('A')).toBe(true);
    expect(pos.has('B')).toBe(true);
  });

  it('should handle wide layers (many nodes at same depth)', () => {
    const nodes = [node('root'), node('A'), node('B'), node('C'), node('D'), node('E')];
    const edges = [edge('root', 'A'), edge('root', 'B'), edge('root', 'C'), edge('root', 'D'), edge('root', 'E')];
    const pos = computeFlowchartLayout(nodes, edges, 'TB');

    // All children should be in the same layer
    const childYs = ['A', 'B', 'C', 'D', 'E'].map((id) => pos.get(id)!.y);
    expect(new Set(childYs).size).toBe(1);

    // All children should have unique x positions
    const childXs = ['A', 'B', 'C', 'D', 'E'].map((id) => pos.get(id)!.x);
    expect(new Set(childXs).size).toBe(5);
  });
});

// ─── edgeLabelPosition ─────────────────────────────────────────────

describe('edgeLabelPosition', () => {
  it('should return the midpoint between two node centers', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 200, y: 200 };
    const mid = edgeLabelPosition(from, to);
    // Centers: from=(100,100), to=(300,300), midpoint=(200,200)
    expect(mid.x).toBe(200);
    expect(mid.y).toBe(200);
  });
});
