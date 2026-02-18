import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import { createYjsProvider } from '../lib/yjs.js';

interface UseYjsReturn {
  doc: Y.Doc;
  provider: HocuspocusProvider;
  objectsMap: Y.Map<unknown>;
  connected: boolean;
}

export function useYjs(boardId: string): UseYjsReturn | null {
  const [connected, setConnected] = useState(false);
  const ref = useRef<{ doc: Y.Doc; provider: HocuspocusProvider } | null>(null);

  useEffect(() => {
    const { doc, provider } = createYjsProvider(boardId);
    ref.current = { doc, provider };

    provider.on('status', ({ status }: { status: string }) => {
      console.log('[YJS] Connection status:', status);
      setConnected(status === 'connected');
    });

    provider.on('close', ({ event }: { event: CloseEvent }) => {
      console.log('[YJS] WebSocket closed:', event.code, event.reason);
    });

    return () => {
      provider.destroy();
      doc.destroy();
      ref.current = null;
    };
  }, [boardId]);

  if (!ref.current) return null;

  const { doc, provider } = ref.current;
  const objectsMap = doc.getMap('objects');

  return { doc, provider, objectsMap, connected };
}
