import type { Request, Response } from 'express';
import type { Hocuspocus } from '@hocuspocus/server';
import Anthropic from '@anthropic-ai/sdk';
import type * as Y from 'yjs';
import { AI_MAX_TOOL_CALLS_PER_REQUEST } from '@collabboard/shared';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { aiTools } from './tools.js';
import { SYSTEM_PROMPT } from './prompts.js';
import { executeTool } from './executor.js';

const anthropic = new Anthropic();

/**
 * Get or create a Yjs document for the given board via Hocuspocus.
 *
 * Hocuspocus manages document lifecycles — `openDirectConnection` gives
 * us an in-process connection that reads/writes the same Y.Doc that
 * WebSocket clients are connected to.
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
 * Express handler for POST /api/ai-command.
 *
 * Flow:
 * 1. Validate request (command + boardId)
 * 2. Open a direct connection to the Hocuspocus Yjs document
 * 3. Call Claude with the user's command + tool definitions
 * 4. Process tool_use blocks in a loop until Claude returns end_turn
 *    or we hit the max tool call limit
 * 5. Return Claude's final text response
 */
export function aiCommandHandler(
  hocuspocus: Hocuspocus,
): (req: Request, res: Response) => void {
  return (req: Request, res: Response): void => {
    const authReq = req as AuthenticatedRequest;
    const { command, boardId } = req.body as { command?: string; boardId?: string };

    if (!command || !boardId) {
      res.status(400).json({ error: 'Missing command or boardId' });
      return;
    }

    const userId = authReq.userId ?? 'ai-agent';

    void handleAICommand(hocuspocus, command, boardId, userId, res);
  };
}

async function handleAICommand(
  hocuspocus: Hocuspocus,
  command: string,
  boardId: string,
  userId: string,
  res: Response,
): Promise<void> {
  let docCleanup: (() => Promise<void>) | null = null;

  try {
    const { doc, cleanup } = await getDocument(hocuspocus, boardId);
    docCleanup = cleanup;

    // Build initial messages
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: command },
    ];

    let toolCallCount = 0;

    // Agentic loop: call Claude, execute tools, feed results back
    while (toolCallCount < AI_MAX_TOOL_CALLS_PER_REQUEST) {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
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
}
