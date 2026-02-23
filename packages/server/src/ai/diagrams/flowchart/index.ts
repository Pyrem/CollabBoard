import { FLOWCHART_PLAN_SCHEMA } from '@collabboard/shared';
import type { DiagramHandler } from '../types.js';
import { FLOWCHART_PLANNER_PROMPT } from './prompt.js';
import { renderFlowchart } from './renderer.js';

/**
 * Flowchart diagram handler.
 *
 * Unlike template diagrams (SWOT, Kanban, Retro), the flowchart planner
 * outputs a *graph topology* (nodes + edges). A layered layout engine
 * computes positions, and the renderer materialises sticky notes
 * (colour-coded by node type) connected by arrows.
 */
export const flowchartHandler: DiagramHandler = {
  type: 'flowchart',
  plannerPrompt: FLOWCHART_PLANNER_PROMPT,
  schema: FLOWCHART_PLAN_SCHEMA as Record<string, unknown>,
  render: renderFlowchart,
};
