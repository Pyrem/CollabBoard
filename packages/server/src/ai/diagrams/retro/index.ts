import { RETRO_PLAN_SCHEMA } from '@collabboard/shared';
import type { DiagramHandler } from '../types.js';
import { RETRO_PLANNER_PROMPT } from './prompt.js';
import { renderRetro } from './renderer.js';

/**
 * Retrospective board diagram handler.
 *
 * Planner → validated RetroPlanV1 → horizontal row of column frames
 * with vertically stacked, colour-coded sticky note cards themed for
 * retrospective formats (classic, Start/Stop/Continue, 4Ls, etc.).
 */
export const retroHandler: DiagramHandler = {
  type: 'retro',
  plannerPrompt: RETRO_PLANNER_PROMPT,
  schema: RETRO_PLAN_SCHEMA as Record<string, unknown>,
  render: renderRetro,
};
