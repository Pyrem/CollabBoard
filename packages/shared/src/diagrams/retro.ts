// ─── Retrospective Diagram Types, Schema & Layout Constants ─────────

import type { STICKY_COLORS } from '../constants.js';

/** Allowed sticky note colours (matches STICKY_COLORS palette). */
type StickyColor = (typeof STICKY_COLORS)[number];

/** A card (sticky note) inside a retro column. */
export interface RetroCard {
  text: string;
  color?: StickyColor;
}

/** A single column in the retrospective board. */
export interface RetroColumn {
  title: string;
  color?: StickyColor;
  cards: RetroCard[];
}

/**
 * Structured plan produced by the AI planner for a Retrospective board.
 *
 * The planner outputs **only** this JSON — no tool calls. A deterministic
 * renderer then converts it into board objects via {@link executeTool}.
 */
export interface RetroPlanV1 {
  version: 1;
  diagramType: 'retro';
  title: string;
  columns: RetroColumn[];
}

/**
 * JSON Schema (draft-07) for {@link RetroPlanV1}.
 *
 * Used by Ajv at runtime to validate the AI planner's output before
 * the renderer touches the Yjs document.
 */
export const RETRO_PLAN_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'RetroPlanV1',
  type: 'object',
  additionalProperties: false,
  required: ['version', 'diagramType', 'title', 'columns'],
  properties: {
    version: { const: 1 },
    diagramType: { const: 'retro' },
    title: { type: 'string', minLength: 1, maxLength: 80 },
    columns: {
      type: 'array',
      minItems: 2,
      maxItems: 5,
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
          maxItems: 15,
          items: { $ref: '#/definitions/card' },
        },
      },
    },
  },
} as const;

// ─── Layout constants ───────────────────────────────────────────────

/**
 * Deterministic layout parameters for Retrospective rendering.
 *
 * Columns are arranged horizontally. Each column is a frame containing
 * vertically stacked sticky notes (one per row).
 */
export const RETRO_LAYOUT = {
  /** Fixed sticky note size (w & h). */
  STICKY_SIZE: 200,
  /** Vertical gap between cards inside a column. */
  GAP: 24,
  /** Left/right padding inside each column frame. */
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
 * Default card colour per column index for classic retro formats.
 *
 * Index 0 → green ("What went well"), 1 → orange ("To improve"),
 * 2 → blue ("Action items"). Cycles for formats with more columns.
 */
export const RETRO_COLUMN_COLORS: readonly StickyColor[] = [
  '#4CAF50', // green  — "What went well" / "Liked" / "Start"
  '#FF9800', // orange — "What to improve" / "Lacked" / "Stop"
  '#2196F3', // blue   — "Action items" / "Learned" / "Continue"
  '#E91E63', // pink   — "Longed for" / "Mad"
  '#9C27B0', // purple — overflow
];
