import type { Request, Response } from 'express';
import type { Hocuspocus } from '@hocuspocus/server';
import Anthropic from '@anthropic-ai/sdk';
import { wrapAnthropic } from 'langsmith/wrappers/anthropic';
import { traceable } from 'langsmith/traceable';
import type * as Y from 'yjs';
import { AI_MAX_TOOL_CALLS_PER_REQUEST } from '@collabboard/shared';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { aiTools } from './tools.js';
import { SYSTEM_PROMPT } from './prompts.js';
import { executeTool } from './executor.js';

const anthropic = wrapAnthropic(new Anthropic());

/**
 * Open a direct (in-process) connection to a Hocuspocus-managed Yjs document.
 *
 * Hocuspocus manages document lifecycles — `openDirectConnection` gives
 * us an in-process connection that reads/writes the **same** `Y.Doc` that
 * WebSocket clients are connected to. This means any mutations the AI agent
 * makes are immediately visible to all connected browsers via normal Yjs sync.
 *
 * @param hocuspocus - The running Hocuspocus server instance.
 * @param boardId - Document / room name (maps to the client's `boardId`).
 * @returns An object containing:
 *   - `doc` — the live `Y.Doc` instance for the board.
 *   - `cleanup` — an async function that disconnects the direct connection
 *     when the AI request is finished. Must be called in a `finally` block.
 * @throws {Error} If Hocuspocus fails to open the document.
 */
async function getDocument(
  hocuspocus: Hocuspocus,
  boardId: string,
): Promise<{ doc: Y.Doc; cleanup: () => Promise<void> }> {
  const connection = await hocuspocus.openDirectConnection(boardId, {});
  const doc = connection.document;
  if (!doc) {
    await connection.disconnect();
    throw new Error(`Failed to open document for board "${boardId}"`);
  }
  return {
    doc: doc as Y.Doc,
    cleanup: async () => {
      await connection.disconnect();
    },
  };
}

/**
 * Factory that returns an Express request handler for `POST /api/ai-command`.
 *
 * The handler validates the request body (`command` and `boardId` are required),
 * extracts the authenticated user ID from {@link AuthenticatedRequest}, and
 * delegates to the agentic loop in {@link handleAICommand}.
 *
 * The Hocuspocus instance is captured via closure so the handler can open a
 * direct connection to the Yjs document for the requested board.
 *
 * @param hocuspocus - The running Hocuspocus server instance (used to obtain
 *   direct document access for the AI agent).
 * @returns A standard Express `(req, res) => void` handler.
 *
 * @example
 * app.post('/api/ai-command', createRateLimiter(), authMiddleware, aiCommandHandler(hocuspocus));
 */
export function aiCommandHandler(
  hocuspocus: Hocuspocus,
): (req: Request, res: Response) => void {
  return (req: Request, res: Response): void => {
    const authReq = req as AuthenticatedRequest;
    const { command, boardId, viewportCenter } = req.body as {
      command?: string;
      boardId?: string;
      viewportCenter?: { x: number; y: number };
    };

    if (!command || !boardId) {
      res.status(400).json({ error: 'Missing command or boardId' });
      return;
    }

    const userId = authReq.userId ?? 'ai-agent';

    void handleAICommand(hocuspocus, command, boardId, userId, res, viewportCenter);
  };
}

/**
 * Core agentic loop — call Claude, execute tool calls, feed results back.
 *
 * Wrapped with LangSmith's `traceable` for observability. The loop continues
 * until one of three exit conditions:
 * 1. Claude returns a response with **no** `tool_use` blocks (pure text).
 * 2. Claude's `stop_reason` is `"end_turn"` after tool execution.
 * 3. The cumulative tool call count reaches {@link AI_MAX_TOOL_CALLS_PER_REQUEST}.
 *
 * If the user's viewport center is provided, it is prepended to the first
 * message so the AI places new objects within the visible area.
 *
 * The direct Yjs document connection is cleaned up in a `finally` block,
 * and any unhandled errors result in a `500` JSON response.
 *
 * @param hocuspocus - The Hocuspocus server instance for document access.
 * @param command - The user's natural-language command.
 * @param boardId - The board / document name to operate on.
 * @param userId - Firebase UID stamped on every Yjs mutation via `lastModifiedBy`.
 * @param res - Express response — the final JSON payload is written here.
 * @param viewportCenter - Optional `{ x, y }` of the user's viewport center,
 *   used to instruct the AI where to place new objects.
 */
const handleAICommand = traceable(async function handleAICommand(
  hocuspocus: Hocuspocus,
  command: string,
  boardId: string,
  userId: string,
  res: Response,
  viewportCenter?: { x: number; y: number },
): Promise<void> {
  let docCleanup: (() => Promise<void>) | null = null;

  try {
    const { doc, cleanup } = await getDocument(hocuspocus, boardId);
    docCleanup = cleanup;

    // Build initial messages with viewport context
    let userMessage = command;
    if (viewportCenter) {
      userMessage = `[The user's viewport is currently centered at coordinates (${Math.round(viewportCenter.x)}, ${Math.round(viewportCenter.y)}). Place new objects near this area so they are visible to the user.]\n\n${command}`;
    }

    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: userMessage },
    ];

    let toolCallCount = 0;

    // Agentic loop: call Claude, execute tools, feed results back
    while (toolCallCount < AI_MAX_TOOL_CALLS_PER_REQUEST) {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: aiTools,
        messages,
      });

      // Collect text blocks for the final response
      const textParts: string[] = [];
      const toolUseBlocks: Anthropic.ToolUseBlock[] = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          textParts.push(block.text);
        } else if (block.type === 'tool_use') {
          toolUseBlocks.push(block);
        }
      }

      // If no tool calls, we're done
      if (toolUseBlocks.length === 0) {
        res.json({
          response: textParts.join('\n'),
          toolCallCount,
        });
        return;
      }

      // Execute all tool calls in this response
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        toolCallCount++;
        const result = executeTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>,
          doc,
          userId,
        );
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
          is_error: !result.success,
        });
      }

      // Add assistant message and tool results to conversation
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });

      // If Claude indicated end_turn, make one more call to get the final text
      if (response.stop_reason === 'end_turn') {
        res.json({
          response: textParts.join('\n') || 'Done!',
          toolCallCount,
        });
        return;
      }
    }

    // Hit max tool calls
    res.json({
      response: `Completed with ${String(toolCallCount)} tool calls (limit reached).`,
      toolCallCount,
    });
  } catch (error: unknown) {
    console.error('[AI] Error handling command:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (!res.headersSent) {
      res.status(500).json({ error: `AI command failed: ${message}` });
    }
  } finally {
    if (docCleanup) {
      await docCleanup();
    }
  }
}, { name: 'ai-command', metadata: { service: 'collabboard' } });
