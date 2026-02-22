import { useCallback, useState } from 'react';
import { getIdToken } from '../lib/firebase.js';

const AI_ENDPOINT = (import.meta.env['VITE_AI_ENDPOINT_URL'] as string | undefined) ?? '/api/ai-command';

/**
 * A single message in the AI chat panel conversation.
 *
 * @property role - `"user"` for outgoing commands, `"assistant"` for AI
 *   responses, `"error"` for client-side or server-side error messages.
 * @property content - The display text of the message.
 */
export interface AIMessage {
  role: 'user' | 'assistant' | 'error';
  content: string;
}

/** Canvas-space centre of the user's viewport, sent to the AI so it places objects visibly. */
export interface ViewportCenter {
  x: number;
  y: number;
}

/**
 * Shape returned by {@link useAI}.
 *
 * @property messages - The full conversation history rendered in the chat panel.
 * @property isLoading - `true` while an AI request is in-flight.
 * @property sendCommand - Sends a command to `POST /api/ai-command` and appends
 *   the response (or error) to `messages`.
 */
export interface UseAIReturn {
  messages: AIMessage[];
  isLoading: boolean;
  sendCommand: (command: string, boardId: string, viewportCenter?: ViewportCenter) => Promise<void>;
}

/**
 * Hook for sending natural-language commands to the AI agent endpoint.
 *
 * Manages the full conversation history (`messages`) and a `isLoading` flag.
 * `sendCommand` performs an authenticated `fetch` to the AI endpoint, parses
 * the JSON response, and appends either an `"assistant"` or `"error"` message.
 *
 * Because the AI agent writes directly to the Yjs document on the server,
 * board changes appear in real time via normal Yjs sync — no additional
 * client-side handling is required.
 *
 * @returns A {@link UseAIReturn} object with stable references (callbacks
 *   are wrapped in `useCallback` with `[]` deps).
 *
 * @example
 * const ai = useAI();
 * ai.sendCommand('Create a SWOT analysis', boardId, { x: 500, y: 400 });
 */
export function useAI(): UseAIReturn {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const sendCommand = useCallback(async (command: string, boardId: string, viewportCenter?: ViewportCenter): Promise<void> => {
    setMessages((prev) => [...prev, { role: 'user', content: command }]);
    setIsLoading(true);

    try {
      const token = await getIdToken();
      if (!token) {
        setMessages((prev) => [...prev, { role: 'error', content: 'Not authenticated' }]);
        return;
      }

      const res = await fetch(AI_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ command, boardId, viewportCenter }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Request failed' })) as { error?: string };
        setMessages((prev) => [
          ...prev,
          { role: 'error', content: errorData.error ?? `HTTP ${String(res.status)}` },
        ]);
        return;
      }

      const text = await res.text();
      if (!text) {
        setMessages((prev) => [...prev, { role: 'error', content: 'Empty response from server' }]);
        return;
      }
      let data: { response?: string; error?: string };
      try {
        data = JSON.parse(text) as { response?: string; error?: string };
      } catch {
        setMessages((prev) => [...prev, { role: 'error', content: 'Invalid response from server — is VITE_AI_ENDPOINT_URL configured?' }]);
        return;
      }
      if (data.error) {
        setMessages((prev) => [...prev, { role: 'error', content: data.error ?? 'Unknown error' }]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: data.response ?? 'Done!' },
        ]);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Network error';
      setMessages((prev) => [...prev, { role: 'error', content: message }]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { messages, isLoading, sendCommand };
}
