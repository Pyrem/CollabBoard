import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { getIdToken } from './firebase.js';

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

export function createYjsProvider(boardId: string): {
  doc: Y.Doc;
  provider: HocuspocusProvider;
} {
  const doc = new Y.Doc();

  const provider = new HocuspocusProvider({
    url: HOCUSPOCUS_URL,
    name: boardId,
    document: doc,
    token: async () => {
      const token = await getIdToken();
      return token ?? '';
    },
  });

  return { doc, provider };
}
