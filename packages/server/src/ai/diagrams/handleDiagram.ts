// ─── Two-phase diagram dispatcher ───────────────────────────────────
//
// Phase 1: Call Claude with the handler's planner prompt → JSON plan.
// Phase 2: Validate → render deterministically via executeTool.
//
// Called from the agentic loop in handler.ts when the tool name is
// "createDiagram".

import type * as Y from 'yjs';
import type Anthropic from '@anthropic-ai/sdk';
import Ajv from 'ajv';
import type { ToolResult } from '../executor.js';
import { diagramRegistry } from './registry.js';
import type { DiagramHandler } from './types.js';

const ajv = new Ajv();

/** Maximum planning attempts before giving up (initial + 1 retry). */
const MAX_PLAN_ATTEMPTS = 2;

/**
 * Extract a JSON object from a model response that may contain markdown
 * code fences or surrounding whitespace.
 */
function extractJSON(text: string): string {
  // Try to unwrap ```json ... ``` or ``` ... ```
  const fenced = /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/.exec(text);
  if (fenced?.[1]) return fenced[1].trim();
  return text.trim();
}

/**
 * Phase 1: Ask Claude to produce a structured plan (JSON only).
 *
 * Retries once if the output fails JSON parsing or schema validation,
 * feeding validation errors back so the model can self-correct.
 */
async function planDiagram(
  handler: DiagramHandler,
  topic: string,
  client: Anthropic,
): Promise<ToolResult> {
  const validate = ajv.compile(handler.schema);
  let lastError = '';

  for (let attempt = 0; attempt < MAX_PLAN_ATTEMPTS; attempt++) {
    const userContent =
      attempt === 0
        ? topic
        : `Your previous response was not valid JSON matching the required schema.\nErrors: ${lastError}\n\nPlease try again for the topic: ${topic}`;

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: handler.plannerPrompt,
      messages: [{ role: 'user', content: userContent }],
    });

    // Extract text from the response
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    // Parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJSON(text));
    } catch {
      lastError = 'Response was not valid JSON';
      continue;
    }

    // Validate against schema
    if (!validate(parsed)) {
      lastError = JSON.stringify(validate.errors);
      continue;
    }

    return { success: true, message: 'Plan generated', data: parsed };
  }

  return {
    success: false,
    message: `Failed to generate a valid diagram plan after ${String(MAX_PLAN_ATTEMPTS)} attempts. Last error: ${lastError}`,
  };
}

/**
 * Entry point called from the agentic loop when `toolName === 'createDiagram'`.
 *
 * Resolves the diagram type from the registry, runs the two-phase
 * plan → render pipeline, and returns a summary {@link ToolResult}.
 *
 * @param input - Tool input from Claude (`{ type, topic }`).
 * @param doc - Live Yjs document for the board.
 * @param userId - Firebase UID stamped on every created object.
 * @param viewportCenter - User's viewport center for positioning.
 * @param client - Anthropic SDK client (may be LangSmith-wrapped).
 */
export async function handleDiagram(
  input: Record<string, unknown>,
  doc: Y.Doc,
  userId: string,
  viewportCenter: { x: number; y: number },
  client: Anthropic,
): Promise<ToolResult> {
  const diagramType = input['type'] as string | undefined;
  const topic = input['topic'] as string | undefined;

  if (!diagramType) {
    return { success: false, message: 'Missing required parameter: "type"' };
  }
  if (!topic) {
    return { success: false, message: 'Missing required parameter: "topic"' };
  }

  const handler = diagramRegistry.get(diagramType);
  if (!handler) {
    const supported = [...diagramRegistry.keys()].join(', ');
    return {
      success: false,
      message: `Unknown diagram type: "${diagramType}". Supported types: ${supported}`,
    };
  }

  // Phase 1: Plan
  const planResult = await planDiagram(handler, topic, client);
  if (!planResult.success) {
    return planResult;
  }

  // Phase 2: Render
  return handler.render(planResult.data, { doc, userId, viewportCenter });
}
