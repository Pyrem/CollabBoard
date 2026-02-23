import type { BoardMetadata } from '@collabboard/shared';
import { getIdToken } from './firebase.js';

/**
 * Derive the HTTP API base URL from the Hocuspocus WebSocket URL.
 *
 * Converts `ws://` → `http://` and `wss://` → `https://`, then strips any
 * trailing slash. Falls back to an empty string (same-origin relative paths)
 * when the env var is not set.
 */
function getApiBase(): string {
  const wsUrl = import.meta.env['VITE_HOCUSPOCUS_URL'] as string | undefined;
  if (!wsUrl) return '';
  return wsUrl.replace(/^ws(s?):\/\//, 'http$1://').replace(/\/+$/, '');
}

const API_BASE = getApiBase();

async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getIdToken();
  if (!token) throw new Error('Not authenticated');
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
}

export async function createBoard(title?: string): Promise<BoardMetadata> {
  const res = await authFetch('/api/boards', {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`Failed to create board: ${String(res.status)}`);
  return res.json() as Promise<BoardMetadata>;
}

export async function listBoards(): Promise<BoardMetadata[]> {
  const res = await authFetch('/api/boards');
  if (!res.ok) throw new Error(`Failed to list boards: ${String(res.status)}`);
  return res.json() as Promise<BoardMetadata[]>;
}

export async function getBoard(id: string): Promise<BoardMetadata> {
  const res = await authFetch(`/api/boards/${id}`);
  if (!res.ok) throw new Error(`Failed to get board: ${String(res.status)}`);
  return res.json() as Promise<BoardMetadata>;
}

export async function updateBoardTitle(id: string, title: string): Promise<BoardMetadata> {
  const res = await authFetch(`/api/boards/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`Failed to update board: ${String(res.status)}`);
  return res.json() as Promise<BoardMetadata>;
}

export async function deleteBoard(id: string): Promise<void> {
  const res = await authFetch(`/api/boards/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to delete board: ${String(res.status)}`);
}
