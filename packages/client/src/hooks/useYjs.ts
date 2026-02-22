import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import type { User } from 'firebase/auth';
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
 * Fetches a Firebase ID token from the supplied `user` before creating
 * the provider, guaranteeing the WebSocket handshake always carries a
 * valid JWT.  The provider is only instantiated once the token is
 * available, so the hook returns `null` until then.
 *
 * Tears down the provider and document on unmount (or when `boardId` /
 * `user` changes). Connection status is tracked in `connected`.
 *
 * @param boardId - Room / document name used by Hocuspocus.
 * @param user - The authenticated Firebase user (from {@link AuthContext}).
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
export function useYjs(boardId: string, user: User): UseYjsReturn | null {
  const [state, setState] = useState<{ doc: Y.Doc; provider: HocuspocusProvider } | null>(null);
  const [connected, setConnected] = useState(false);
  // Track whether this effect invocation is still current (not stale)
  const activeRef = useRef(0);

  useEffect(() => {
    const id = ++activeRef.current;
    let doc: Y.Doc | null = null;
    let provider: HocuspocusProvider | null = null;

    user.getIdToken().then((token) => {
      // If the effect was cleaned up while we were awaiting the token, bail
      if (id !== activeRef.current) return;

      const result = createYjsProvider(boardId, token);
      doc = result.doc;
      provider = result.provider;

      provider.on('status', ({ status }: { status: string }) => {
        console.log('[YJS] Connection status:', status);
        setConnected(status === 'connected');
      });

      provider.on('close', ({ event }: { event: CloseEvent }) => {
        console.log('[YJS] WebSocket closed:', event.code, event.reason);
      });

      setState({ doc, provider });
    }).catch((err: unknown) => {
      console.error('[YJS] Failed to get auth token:', err);
    });

    return () => {
      activeRef.current++;
      provider?.destroy();
      doc?.destroy();
      setState(null);
      setConnected(false);
    };
  }, [boardId, user]);

  if (!state) return null;

  const objectsMap = state.doc.getMap('objects');
  return { doc: state.doc, provider: state.provider, objectsMap, connected };
}
