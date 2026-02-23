// ─── Diagram handler interface ──────────────────────────────────────

import type * as Y from 'yjs';
import type { ToolResult } from '../executor.js';

/**
 * Context passed to every diagram renderer.
 *
 * Contains the live Yjs document, the acting user's ID, and the
 * viewport center for positioning the diagram on-screen.
 */
export interface RenderContext {
  doc: Y.Doc;
  userId: string;
  viewportCenter: { x: number; y: number };
}

/**
 * Contract that every diagram type must implement.
 *
 * The registry stores one `DiagramHandler` per supported `type` string.
 * The planning + rendering pipeline in `handleDiagram.ts` drives the
 * two-phase flow:
 *   1. Call Claude with `plannerPrompt` → receive JSON.
 *   2. Validate JSON against `schema` (via Ajv).
 *   3. Pass validated plan to `render()` → deterministic board objects.
 */
export interface DiagramHandler {
  /** Diagram type key — must match the `type` enum in the `createDiagram` tool. */
  type: string;

  /** System prompt sent to Claude during the planning phase (JSON-only output). */
  plannerPrompt: string;

  /** JSON Schema object compiled by Ajv to validate the planner's output. */
  schema: Record<string, unknown>;

  /**
   * Deterministic renderer: converts a validated plan into board objects
   * by calling {@link executeTool} against the live Yjs document.
   *
   * All `executeTool` calls are wrapped in `doc.transact()` so connected
   * clients see a single atomic update.
   */
  render(plan: unknown, ctx: RenderContext): ToolResult;
}
