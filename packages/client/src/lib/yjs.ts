import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { getIdTokenOrThrow } from './firebase.js';

/**
 * Resolve the Hocuspocus WebSocket URL from the environment.
 *
 * Resolution order:
 * 1. `VITE_HOCUSPOCUS_URL` env var (highest priority).
 * 2. In production: derive `wss://` or `ws://` from the current page origin
 *    (assumes the Hocuspocus server is co-located or proxied).
 * 3. In development: fall back to `ws://localhost:3001`.
 *
 * A `console.warn` is emitted in production when the env var is missing so
 * the developer knows to configure it.
 *
 * @returns The WebSocket URL string (e.g. `"wss://api.example.com"`).
 */
function getHocuspocusUrl(): string {
  const envUrl = import.meta.env['VITE_HOCUSPOCUS_URL'] as string | undefined;
  if (envUrl) return envUrl;

  if (import.meta.env.PROD) {
    // In production, derive WebSocket URL from the current page origin
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Default: assume server is on a sibling Render service
    console.warn('[YJS] VITE_HOCUSPOCUS_URL not set — set it in your hosting environment variables');
    return `${protocol}//${window.location.host}`;
  }

  return 'ws://localhost:3001';
}

const HOCUSPOCUS_URL = getHocuspocusUrl();

console.log('[YJS] Connecting to Hocuspocus at:', HOCUSPOCUS_URL);

/**
 * Create a Yjs document and Hocuspocus provider for the given board.
 *
 * The provider authenticates via the `token` callback, which calls
 * {@link getIdToken} to obtain a fresh Firebase JWT on each connection
 * attempt (including automatic reconnections).
 *
 * @param boardId - Room / document name passed to Hocuspocus (also the URL
 *   segment the user sees as `/board/:boardId`).
 * @returns `{ doc, provider }` — the caller is responsible for calling
 *   `provider.destroy()` and `doc.destroy()` on cleanup.
 */
export function createYjsProvider(boardId: string): {
  doc: Y.Doc;
  provider: HocuspocusProvider;
} {
  const doc = new Y.Doc();

  const provider = new HocuspocusProvider({
    url: HOCUSPOCUS_URL,
    name: boardId,
    document: doc,
    token: () => getIdTokenOrThrow(),
  });

  return { doc, provider };
}
