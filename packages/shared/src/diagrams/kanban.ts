// ─── Kanban Diagram Types, Schema & Layout Constants ────────────────

import type { STICKY_COLORS } from '../constants.js';

/** Allowed sticky note colours (matches STICKY_COLORS palette). */
type StickyColor = (typeof STICKY_COLORS)[number];

/** A card (sticky note) inside a Kanban column. */
export interface KanbanCard {
  text: string;
  color?: StickyColor;
}

/** A single column in the Kanban board. */
export interface KanbanColumn {
  title: string;
  color?: StickyColor;
  cards: KanbanCard[];
}

/**
 * Structured plan produced by the AI planner for a Kanban board.
 *
 * The planner outputs **only** this JSON — no tool calls. A deterministic
 * renderer then converts it into board objects via {@link executeTool}.
 */
export interface KanbanPlanV1 {
  version: 1;
  diagramType: 'kanban';
  title: string;
  columns: KanbanColumn[];
}

/**
 * JSON Schema (draft-07) for {@link KanbanPlanV1}.
 *
 * Used by Ajv at runtime to validate the AI planner's output before
 * the renderer touches the Yjs document.
 */
export const KANBAN_PLAN_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'KanbanPlanV1',
  type: 'object',
  additionalProperties: false,
  required: ['version', 'diagramType', 'title', 'columns'],
  properties: {
    version: { const: 1 },
    diagramType: { const: 'kanban' },
    title: { type: 'string', minLength: 1, maxLength: 80 },
    columns: {
      type: 'array',
      minItems: 2,
      maxItems: 6,
      items: { $ref: '#/definitions/column' },
    },
  },
  definitions: {
    card: {
      type: 'object',
      additionalProperties: false,
      required: ['text'],
      properties: {
        text: { type: 'string', minLength: 1, maxLength: 220 },
        color: {
          enum: ['#FFEB3B', '#FF9800', '#E91E63', '#4CAF50', '#2196F3', '#9C27B0'],
        },
      },
    },
    column: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'cards'],
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 40 },
        color: {
          enum: ['#FFEB3B', '#FF9800', '#E91E63', '#4CAF50', '#2196F3', '#9C27B0'],
        },
        cards: {
          type: 'array',
          minItems: 0,
          maxItems: 20,
          items: { $ref: '#/definitions/card' },
        },
      },
    },
  },
} as const;

// ─── Layout constants ───────────────────────────────────────────────

/**
 * Deterministic layout parameters for Kanban rendering.
 *
 * Columns are arranged horizontally. Each column is a frame containing
 * vertically stacked sticky notes (one per row).
 */
export const KANBAN_LAYOUT = {
  /** Fixed sticky note size (w & h). */
  STICKY_SIZE: 200,
  /** Vertical gap between cards inside a column. */
  GAP: 24,
  /** Left/right padding inside each column frame. Sized so one sticky fits exactly. */
  FRAME_PAD: 40,
  /** Title text font size. */
  TITLE_FONT_SIZE: 36,
  /** Width of each column frame (STICKY_SIZE + 2 * FRAME_PAD). */
  COLUMN_WIDTH: 280,
  /** Minimum height of each column frame. */
  MIN_COLUMN_HEIGHT: 400,
  /** Horizontal gap between columns. */
  COLUMN_GAP: 40,
  /** Vertical gap between the title text and the column frames. */
  TITLE_GAP: 90,
  /** Vertical offset inside each frame for the title bar. */
  FRAME_TITLE_OFFSET: 80,
} as const;

/**
 * Default card colour per column index (cycled if more columns than colours).
 *
 * Provides visual distinction between columns when the plan omits colours.
 */
export const KANBAN_COLUMN_COLORS: readonly StickyColor[] = [
  '#2196F3', // blue  — e.g. "To Do" / "Backlog"
  '#FF9800', // orange — e.g. "In Progress"
  '#4CAF50', // green  — e.g. "Done"
  '#E91E63', // pink   — e.g. "Blocked"
  '#9C27B0', // purple
  '#FFEB3B', // yellow
];
