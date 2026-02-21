import { useCallback, useState } from 'react';
import { getIdToken } from '../lib/firebase.js';

const AI_ENDPOINT = (import.meta.env['VITE_AI_ENDPOINT_URL'] as string | undefined) ?? '/api/ai-command';

export interface AIMessage {
  role: 'user' | 'assistant' | 'error';
  content: string;
}

export interface UseAIReturn {
  messages: AIMessage[];
  isLoading: boolean;
  sendCommand: (command: string, boardId: string) => Promise<void>;
}

/**
 * Hook for sending natural language commands to the AI agent.
 *
 * Manages conversation history and loading state. The AI endpoint
 * returns a response after executing tool calls against the Yjs document,
 * so board changes appear in real time via normal Yjs sync.
 */
export function useAI(): UseAIReturn {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const sendCommand = useCallback(async (command: string, boardId: string): Promise<void> => {
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
        body: JSON.stringify({ command, boardId }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Request failed' })) as { error?: string };
        setMessages((prev) => [
          ...prev,
          { role: 'error', content: errorData.error ?? `HTTP ${String(res.status)}` },
        ]);
        return;
      }

      const data = await res.json() as { response?: string; error?: string };
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
