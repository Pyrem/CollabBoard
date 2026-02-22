import { KANBAN_PLAN_SCHEMA } from '@collabboard/shared';
import type { DiagramHandler } from '../types.js';
import { KANBAN_PLANNER_PROMPT } from './prompt.js';
import { renderKanban } from './renderer.js';

/**
 * Kanban board diagram handler.
 *
 * Planner → validated KanbanPlanV1 → horizontal row of column frames
 * with vertically stacked, colour-coded sticky note cards.
 */
export const kanbanHandler: DiagramHandler = {
  type: 'kanban',
  plannerPrompt: KANBAN_PLANNER_PROMPT,
  schema: KANBAN_PLAN_SCHEMA as Record<string, unknown>,
  render: renderKanban,
};
