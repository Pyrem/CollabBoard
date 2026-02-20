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

/**
 * Connect to a Hocuspocus-backed Yjs document for the given board.
 *
 * Creates a `Y.Doc` and `HocuspocusProvider` on mount and tears them down on
 * unmount (or when `boardId` changes). Connection status is tracked in
 * `connected`.
 *
 * @param boardId - Room / document name used by Hocuspocus.
 * @returns `null` until the provider has been created; then an object with:
 *   - `doc` — the raw `Y.Doc` instance
 *   - `provider` — the `HocuspocusProvider` (for awareness / cursor use)
 *   - `objectsMap` — `doc.getMap('objects')`, the shared map holding all board objects
 *   - `connected` — `true` while the WebSocket connection is alive
 *
 * @remarks
 * Side-effects: opens a WebSocket connection on mount. The cleanup function
 * calls `provider.destroy()` and `doc.destroy()`.
 */
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
