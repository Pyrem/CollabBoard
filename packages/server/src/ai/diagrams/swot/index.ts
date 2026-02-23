import { SWOT_PLAN_SCHEMA } from '@collabboard/shared';
import type { DiagramHandler } from '../types.js';
import { SWOT_PLANNER_PROMPT } from './prompt.js';
import { renderSwot } from './renderer.js';

/**
 * SWOT diagram handler — the first entry in the diagram registry.
 *
 * Planner → validated SWOTPlanV1 → deterministic 2×2 grid of frames
 * with colour-coded sticky notes.
 */
export const swotHandler: DiagramHandler = {
  type: 'swot',
  plannerPrompt: SWOT_PLANNER_PROMPT,
  schema: SWOT_PLAN_SCHEMA as Record<string, unknown>,
  render: renderSwot,
};
