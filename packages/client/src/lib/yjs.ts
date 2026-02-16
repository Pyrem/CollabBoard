import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { getIdToken } from './firebase.js';

const HOCUSPOCUS_URL = (import.meta.env['VITE_HOCUSPOCUS_URL'] as string) ?? 'ws://localhost:1234';

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
