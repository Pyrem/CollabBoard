// ─── Diagram type registry ──────────────────────────────────────────
//
// One DiagramHandler per supported diagram type. Adding a new template
// (kanban, retro, etc.) requires only a new handler + one .set() call.

import type { DiagramHandler } from './types.js';
import { swotHandler } from './swot/index.js';

const registry = new Map<string, DiagramHandler>();
registry.set('swot', swotHandler);

export { registry as diagramRegistry };

/** All supported diagram type strings, for use in tool enum definitions. */
export const DIAGRAM_TYPES = [...registry.keys()] as string[];
