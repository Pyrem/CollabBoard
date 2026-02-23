// ─── Diagram type registry ──────────────────────────────────────────
//
// One DiagramHandler per supported diagram type. Adding a new template
// (kanban, retro, etc.) requires only a new handler + one .set() call.

import type { DiagramHandler } from './types.js';
import { swotHandler } from './swot/index.js';
import { kanbanHandler } from './kanban/index.js';
import { retroHandler } from './retro/index.js';

const registry = new Map<string, DiagramHandler>();
registry.set('swot', swotHandler);
registry.set('kanban', kanbanHandler);
registry.set('retro', retroHandler);

export { registry as diagramRegistry };

/** All supported diagram type strings, for use in tool enum definitions. */
export const DIAGRAM_TYPES = [...registry.keys()] as string[];
