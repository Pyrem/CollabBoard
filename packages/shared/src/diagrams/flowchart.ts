// ─── Flowchart Diagram Types, Schema & Layout Constants ─────────────
//
// Unlike template diagrams (SWOT, Kanban, Retro) which have fixed
// structures, a flowchart's *topology* is dynamic — the planner
// outputs a graph of nodes + edges, and a layout engine computes
// positions via layered graph drawing (Sugiyama-style).

import type { STICKY_COLORS } from '../constants.js';

type StickyColor = (typeof STICKY_COLORS)[number];

// ─── Plan types ─────────────────────────────────────────────────────

/** A node in the flowchart graph. */
export interface FlowchartNode {
  /** Temporary ID used only within the plan to reference in edges. */
  id: string;
  /** Display label (shown as sticky note text). */
  label: string;
  /** Semantic type — determines colour and visual treatment. */
  type: 'process' | 'decision' | 'start' | 'end';
}

/** A directed edge between two nodes. */
export interface FlowchartEdge {
  /** Source node ID (from plan). */
  from: string;
  /** Target node ID (from plan). */
  to: string;
  /** Optional edge label (e.g. "yes", "no" on decision branches). */
  label?: string;
}

/**
 * Structured plan produced by the AI planner for a flowchart.
 *
 * The planner describes the *graph topology* — nodes, edges, direction.
 * A layout engine then computes positions via layered graph drawing,
 * and a renderer materialises everything as board objects.
 */
export interface FlowchartPlanV1 {
  version: 1;
  diagramType: 'flowchart';
  title: string;
  /** Layout direction: top-to-bottom or left-to-right. */
  direction: 'TB' | 'LR';
  nodes: FlowchartNode[];
  edges: FlowchartEdge[];
}

// ─── JSON Schema ────────────────────────────────────────────────────

export const FLOWCHART_PLAN_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'FlowchartPlanV1',
  type: 'object',
  additionalProperties: false,
  required: ['version', 'diagramType', 'title', 'direction', 'nodes', 'edges'],
  properties: {
    version: { const: 1 },
    diagramType: { const: 'flowchart' },
    title: { type: 'string', minLength: 1, maxLength: 80 },
    direction: { enum: ['TB', 'LR'] },
    nodes: {
      type: 'array',
      minItems: 2,
      maxItems: 25,
      items: { $ref: '#/definitions/node' },
    },
    edges: {
      type: 'array',
      minItems: 1,
      maxItems: 40,
      items: { $ref: '#/definitions/edge' },
    },
  },
  definitions: {
    node: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'label', 'type'],
      properties: {
        id: { type: 'string', minLength: 1, maxLength: 20 },
        label: { type: 'string', minLength: 1, maxLength: 120 },
        type: { enum: ['process', 'decision', 'start', 'end'] },
      },
    },
    edge: {
      type: 'object',
      additionalProperties: false,
      required: ['from', 'to'],
      properties: {
        from: { type: 'string', minLength: 1 },
        to: { type: 'string', minLength: 1 },
        label: { type: 'string', maxLength: 30 },
      },
    },
  },
} as const;

// ─── Layout constants ───────────────────────────────────────────────

/**
 * Layout parameters for flowchart rendering.
 *
 * Nodes are sticky notes (200×200). The layered layout algorithm
 * assigns each node a layer (depth) and position (rank within layer),
 * then converts to canvas coordinates using these spacings.
 */
export const FLOWCHART_LAYOUT = {
  /** Fixed sticky note size (w & h). */
  NODE_SIZE: 200,
  /** Gap between layers (between rows for TB, columns for LR). */
  LAYER_GAP: 120,
  /** Gap between nodes in the same layer. */
  NODE_GAP: 60,
  /** Title text font size. */
  TITLE_FONT_SIZE: 36,
  /** Gap between title and first layer of nodes. */
  TITLE_GAP: 80,
  /** Font size for edge labels. */
  EDGE_LABEL_FONT_SIZE: 14,
} as const;

/**
 * Sticky note colour per node type.
 *
 * Provides immediate visual distinction between process steps,
 * decision points, and start/end terminals.
 */
export const FLOWCHART_NODE_COLORS: Record<FlowchartNode['type'], StickyColor> = {
  start: '#4CAF50',    // green
  end: '#E91E63',      // pink
  process: '#2196F3',  // blue
  decision: '#FF9800', // orange
};
