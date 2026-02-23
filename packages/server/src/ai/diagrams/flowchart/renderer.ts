// ─── Flowchart deterministic renderer ───────────────────────────────
//
// Converts a validated FlowchartPlanV1 into board objects:
//   1. Layout engine computes (x, y) positions for all nodes.
//   2. Create sticky notes for each node (colour-coded by type).
//   3. Create connectors (arrows) for each edge.
//   4. Create small text labels at edge midpoints for labeled edges.
//   5. Create the title text element.
//
// All mutations are wrapped in doc.transact() for atomic update.

import type { FlowchartPlanV1, FlowchartEdge } from '@collabboard/shared';
import { FLOWCHART_LAYOUT, FLOWCHART_NODE_COLORS } from '@collabboard/shared';
import type { ToolResult } from '../../executor.js';
import { executeTool } from '../../executor.js';
import type { RenderContext } from '../types.js';
import { computeFlowchartLayout, edgeLabelPosition } from './layout.js';

/**
 * Render a validated {@link FlowchartPlanV1} onto the board.
 *
 * The renderer is topology-agnostic — it delegates positioning entirely
 * to {@link computeFlowchartLayout} and focuses on creating the right
 * board objects.
 *
 * @returns A {@link ToolResult} summarising what was created.
 */
export function renderFlowchart(plan: FlowchartPlanV1, ctx: RenderContext): ToolResult {
  const { doc, userId, viewportCenter } = ctx;
  const { x: cx, y: cy } = viewportCenter;

  // ── Compute layout ─────────────────────────────────────────────
  const positions = computeFlowchartLayout(plan.nodes, plan.edges, plan.direction);

  // Offset: layout is centered at (0,0), shift to viewportCenter
  // Also account for title taking space above the nodes
  const offsetX = cx;
  const offsetY = cy + FLOWCHART_LAYOUT.TITLE_GAP / 2;

  const createdIds: string[] = [];
  const errors: string[] = [];

  // Map from plan node ID → created board object UUID
  const nodeIdMap = new Map<string, string>();

  doc.transact(() => {
    // ── 1. Title ───────────────────────────────────────────────
    // Place title above the topmost node
    let minY = Infinity;
    let minX = Infinity;
    for (const pos of positions.values()) {
      if (pos.y + offsetY < minY) minY = pos.y + offsetY;
      if (pos.x + offsetX < minX) minX = pos.x + offsetX;
    }

    const titleResult = executeTool(
      'createText',
      {
        text: plan.title,
        x: minX,
        y: minY - FLOWCHART_LAYOUT.TITLE_GAP,
        fontSize: FLOWCHART_LAYOUT.TITLE_FONT_SIZE,
      },
      doc,
      userId,
    );
    if (titleResult.success) {
      createdIds.push((titleResult.data as { id: string }).id);
    } else {
      errors.push(`Title: ${titleResult.message}`);
    }

    // ── 2. Nodes (sticky notes) ────────────────────────────────
    for (const node of plan.nodes) {
      const pos = positions.get(node.id);
      if (!pos) {
        errors.push(`Node "${node.id}": no computed position`);
        continue;
      }

      const color = FLOWCHART_NODE_COLORS[node.type];
      const result = executeTool(
        'createStickyNote',
        {
          text: node.label,
          x: pos.x + offsetX,
          y: pos.y + offsetY,
          color,
        },
        doc,
        userId,
      );
      if (result.success) {
        const boardId = (result.data as { id: string }).id;
        createdIds.push(boardId);
        nodeIdMap.set(node.id, boardId);
      } else {
        errors.push(`Node "${node.id}": ${result.message}`);
      }
    }

    // ── 3. Edges (connectors with arrows) ──────────────────────
    // Determine snap positions based on direction
    const fromSnap = plan.direction === 'TB' ? 'bottom' : 'right';
    const toSnap = plan.direction === 'TB' ? 'top' : 'left';

    for (const edge of plan.edges) {
      const fromBoardId = nodeIdMap.get(edge.from);
      const toBoardId = nodeIdMap.get(edge.to);
      if (!fromBoardId || !toBoardId) {
        errors.push(`Edge ${edge.from}→${edge.to}: missing node`);
        continue;
      }

      const result = executeTool(
        'createConnector',
        {
          fromId: fromBoardId,
          toId: toBoardId,
          style: 'straight',
          endCap: 'arrow',
          fromSnapTo: fromSnap,
          toSnapTo: toSnap,
        },
        doc,
        userId,
      );
      if (result.success) {
        createdIds.push((result.data as { id: string }).id);
      } else {
        errors.push(`Connector ${edge.from}→${edge.to}: ${result.message}`);
      }
    }

    // ── 4. Edge labels ─────────────────────────────────────────
    const labeledEdges = plan.edges.filter(
      (e: FlowchartEdge): e is FlowchartEdge & { label: string } =>
        typeof e.label === 'string' && e.label.length > 0,
    );

    for (const edge of labeledEdges) {
      const fromPos = positions.get(edge.from);
      const toPos = positions.get(edge.to);
      if (!fromPos || !toPos) continue;

      const labelPos = edgeLabelPosition(
        { x: fromPos.x + offsetX, y: fromPos.y + offsetY },
        { x: toPos.x + offsetX, y: toPos.y + offsetY },
      );

      const result = executeTool(
        'createText',
        {
          text: edge.label,
          x: labelPos.x,
          y: labelPos.y,
          fontSize: FLOWCHART_LAYOUT.EDGE_LABEL_FONT_SIZE,
        },
        doc,
        userId,
      );
      if (result.success) {
        createdIds.push((result.data as { id: string }).id);
      } else {
        errors.push(`Edge label "${edge.label}": ${result.message}`);
      }
    }
  });

  // ── Result ─────────────────────────────────────────────────────
  const edgeCount = plan.edges.length;

  if (errors.length > 0) {
    return {
      success: false,
      message: `Flowchart partially created with errors: ${errors.join('; ')}`,
      data: { createdIds, errors },
    };
  }

  return {
    success: true,
    message: `Created flowchart "${plan.title}" with ${String(plan.nodes.length)} nodes and ${String(edgeCount)} connections`,
    data: { createdIds },
  };
}
