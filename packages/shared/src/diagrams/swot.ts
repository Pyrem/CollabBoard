// ─── SWOT Diagram Types, Schema & Layout Constants ──────────────────

import type { STICKY_COLORS } from '../constants.js';

/** Allowed sticky note colours (matches STICKY_COLORS palette). */
export type StickyColor = (typeof STICKY_COLORS)[number];

/** Planned sticky note inside one SWOT quadrant. */
export interface SWOTSticky {
  text: string;
  color?: StickyColor;
}

/**
 * Structured plan produced by the AI planner for a SWOT diagram.
 *
 * The planner outputs **only** this JSON — no tool calls. A deterministic
 * renderer then converts it into board objects via {@link executeTool}.
 */
export interface SWOTPlanV1 {
  version: 1;
  diagramType: 'swot';
  title: string;
  strengths: SWOTSticky[];
  weaknesses: SWOTSticky[];
  opportunities: SWOTSticky[];
  threats: SWOTSticky[];
}

/**
 * JSON Schema (draft-07) for {@link SWOTPlanV1}.
 *
 * Used by Ajv at runtime to validate the AI planner's output before
 * the renderer touches the Yjs document.
 */
export const SWOT_PLAN_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'SWOTPlanV1',
  type: 'object',
  additionalProperties: false,
  required: ['version', 'diagramType', 'title', 'strengths', 'weaknesses', 'opportunities', 'threats'],
  properties: {
    version: { const: 1 },
    diagramType: { const: 'swot' },
    title: { type: 'string', minLength: 1, maxLength: 80 },
    strengths: { $ref: '#/definitions/stickies' },
    weaknesses: { $ref: '#/definitions/stickies' },
    opportunities: { $ref: '#/definitions/stickies' },
    threats: { $ref: '#/definitions/stickies' },
  },
  definitions: {
    sticky: {
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
    stickies: {
      type: 'array',
      minItems: 0,
      maxItems: 30,
      items: { $ref: '#/definitions/sticky' },
    },
  },
} as const;

// ─── Layout constants (tune once) ───────────────────────────────────

/**
 * Deterministic layout parameters for SWOT rendering.
 *
 * All values are in canvas-space pixels. The renderer computes every
 * object position from these constants + the user's viewport center.
 */
export const SWOT_LAYOUT = {
  /** Fixed sticky note size (w & h). */
  STICKY_SIZE: 200,
  /** Gap between stickies inside a frame. */
  GAP: 24,
  /** Padding inside each frame (left/right/bottom). */
  FRAME_PAD: 32,
  /** Title text font size. */
  TITLE_FONT_SIZE: 36,
  /** Width of each quadrant frame. */
  QUAD_WIDTH: 560,
  /** Minimum height of each quadrant frame. */
  QUAD_HEIGHT: 560,
  /** Horizontal gap between the two frame columns. */
  QUAD_GAP: 40,
  /** Vertical gap between the title text and the first row of frames. */
  TITLE_GAP: 90,
  /** Vertical offset inside each frame for the title bar. */
  FRAME_TITLE_OFFSET: 80,
} as const;

/** Default sticky colour per SWOT quadrant (applied when the plan omits `color`). */
export const SWOT_DEFAULT_COLORS: Record<string, StickyColor> = {
  strengths: '#4CAF50',
  weaknesses: '#FF9800',
  opportunities: '#2196F3',
  threats: '#E91E63',
};
