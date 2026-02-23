// ─── Layered graph layout (Sugiyama-style, simplified) ──────────────
//
// Computes (x, y) positions for each node in a directed graph using a
// three-phase approach:
//
//   1. **Layer assignment** — longest-path from roots (Kahn's algorithm).
//   2. **Crossing minimisation** — barycenter ordering within each layer.
//   3. **Coordinate assignment** — convert (layer, rank) → (x, y) using
//      the layout constants and the chosen direction (TB or LR).
//
// The result is a Map<nodeId, { x, y }> centered around (0, 0).
// The caller offsets to viewportCenter.

import type { FlowchartNode, FlowchartEdge } from '@collabboard/shared';
import { FLOWCHART_LAYOUT } from '@collabboard/shared';

export interface NodePosition {
  x: number;
  y: number;
}

/**
 * Compute canvas positions for all nodes in a flowchart.
 *
 * @returns Map from plan node ID → canvas { x, y } centered at origin.
 */
export function computeFlowchartLayout(
  nodes: FlowchartNode[],
  edges: FlowchartEdge[],
  direction: 'TB' | 'LR',
): Map<string, NodePosition> {
  const nodeIds = new Set(nodes.map((n) => n.id));

  // ── Build adjacency lists ──────────────────────────────────────
  const forward = new Map<string, string[]>(); // node → successors
  const reverse = new Map<string, string[]>(); // node → predecessors
  for (const id of nodeIds) {
    forward.set(id, []);
    reverse.set(id, []);
  }
  for (const edge of edges) {
    if (nodeIds.has(edge.from) && nodeIds.has(edge.to)) {
      forward.get(edge.from)!.push(edge.to);
      reverse.get(edge.to)!.push(edge.from);
    }
  }

  // ── Phase 1: Layer assignment (longest path via Kahn's) ────────
  const layers = assignLayers(nodeIds, forward, reverse);

  // ── Phase 2: Order nodes within each layer ─────────────────────
  const layerGroups = groupByLayer(layers);
  orderWithinLayers(layerGroups, layers, reverse);

  // ── Phase 3: Compute coordinates ───────────────────────────────
  const positions = computeCoordinates(layerGroups, direction);

  // ── Center around (0, 0) ───────────────────────────────────────
  centerPositions(positions);

  return positions;
}

// ─── Phase 1: Layer assignment ──────────────────────────────────────

function assignLayers(
  nodeIds: Set<string>,
  forward: Map<string, string[]>,
  reverse: Map<string, string[]>,
): Map<string, number> {
  const layers = new Map<string, number>();
  const indegree = new Map<string, number>();

  for (const id of nodeIds) {
    indegree.set(id, reverse.get(id)!.length);
  }

  // Kahn's algorithm with longest-path layer assignment
  const queue: string[] = [];
  for (const id of nodeIds) {
    if (indegree.get(id) === 0) {
      queue.push(id);
      layers.set(id, 0);
    }
  }

  // If no roots (pure cycle), pick the first node as root
  if (queue.length === 0) {
    const first = nodeIds.values().next().value as string;
    queue.push(first);
    layers.set(first, 0);
  }

  let head = 0;
  while (head < queue.length) {
    const current = queue[head++]!;
    const currentLayer = layers.get(current)!;

    for (const successor of forward.get(current) ?? []) {
      const newLayer = currentLayer + 1;
      const existing = layers.get(successor);

      // Longest path: keep the maximum layer
      if (existing === undefined || newLayer > existing) {
        layers.set(successor, newLayer);
      }

      // Decrement indegree; enqueue when all predecessors processed
      const newIndegree = indegree.get(successor)! - 1;
      indegree.set(successor, newIndegree);
      if (newIndegree === 0) {
        queue.push(successor);
      }
    }
  }

  // Handle unreachable nodes (in cycles not connected to roots)
  for (const id of nodeIds) {
    if (!layers.has(id)) {
      layers.set(id, 0);
    }
  }

  return layers;
}

// ─── Phase 2: Ordering within layers ────────────────────────────────

function groupByLayer(layers: Map<string, number>): Map<number, string[]> {
  const groups = new Map<number, string[]>();
  for (const [id, layer] of layers) {
    if (!groups.has(layer)) groups.set(layer, []);
    groups.get(layer)!.push(id);
  }
  return groups;
}

/**
 * Barycenter heuristic: order nodes in each layer by the average
 * position of their predecessors in the previous layer.
 */
function orderWithinLayers(
  layerGroups: Map<number, string[]>,
  layers: Map<string, number>,
  reverse: Map<string, string[]>,
): void {
  const maxLayer = Math.max(...layerGroups.keys());

  // Build position lookup for the first layer (arbitrary initial order)
  const positionInLayer = new Map<string, number>();
  const layer0 = layerGroups.get(0);
  if (layer0) {
    for (const [i, id] of layer0.entries()) {
      positionInLayer.set(id, i);
    }
  }

  // Process layers 1..maxLayer
  for (let l = 1; l <= maxLayer; l++) {
    const group = layerGroups.get(l);
    if (!group) continue;

    // Compute barycenter for each node
    const barycenters = new Map<string, number>();
    for (const id of group) {
      const preds = (reverse.get(id) ?? []).filter(
        (p) => layers.get(p)! < l && positionInLayer.has(p),
      );
      if (preds.length === 0) {
        // No predecessors in earlier layers — keep a large value to push right
        barycenters.set(id, Infinity);
      } else {
        const avg =
          preds.reduce((sum, p) => sum + positionInLayer.get(p)!, 0) / preds.length;
        barycenters.set(id, avg);
      }
    }

    // Sort by barycenter (stable sort preserves original order for ties)
    group.sort((a, b) => {
      const ba = barycenters.get(a)!;
      const bb = barycenters.get(b)!;
      if (ba === bb) return 0;
      if (ba === Infinity) return 1;
      if (bb === Infinity) return -1;
      return ba - bb;
    });

    // Update position lookup
    for (const [i, id] of group.entries()) {
      positionInLayer.set(id, i);
    }
  }
}

// ─── Phase 3: Coordinate computation ────────────────────────────────

function computeCoordinates(
  layerGroups: Map<number, string[]>,
  direction: 'TB' | 'LR',
): Map<string, NodePosition> {
  const { NODE_SIZE, LAYER_GAP, NODE_GAP } = FLOWCHART_LAYOUT;
  const step = NODE_SIZE + LAYER_GAP; // distance between layer origins
  const nodeStep = NODE_SIZE + NODE_GAP; // distance between node origins within layer
  const positions = new Map<string, NodePosition>();

  for (const [layer, group] of layerGroups) {
    const count = group.length;
    // Center the group within the layer: offset so middle node is at 0
    const layerSpan = (count - 1) * nodeStep;
    const startOffset = -layerSpan / 2;

    for (const [rank, id] of group.entries()) {
      const along = layer * step; // position along the primary axis
      const across = startOffset + rank * nodeStep; // position across

      if (direction === 'TB') {
        positions.set(id, { x: across, y: along });
      } else {
        positions.set(id, { x: along, y: across });
      }
    }
  }

  return positions;
}

// ─── Centering ──────────────────────────────────────────────────────

function centerPositions(positions: Map<string, NodePosition>): void {
  if (positions.size === 0) return;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const { x, y } of positions.values()) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  for (const [id, pos] of positions) {
    positions.set(id, { x: pos.x - cx, y: pos.y - cy });
  }
}

/**
 * Compute the midpoint between two nodes for placing edge labels.
 *
 * Accounts for node size — uses center of each sticky note.
 */
export function edgeLabelPosition(
  fromPos: NodePosition,
  toPos: NodePosition,
): NodePosition {
  const half = FLOWCHART_LAYOUT.NODE_SIZE / 2;
  return {
    x: (fromPos.x + half + toPos.x + half) / 2,
    y: (fromPos.y + half + toPos.y + half) / 2,
  };
}
