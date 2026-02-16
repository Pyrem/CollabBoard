import { useEffect, useState, useCallback, useRef } from 'react';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import type { UserPresence, CursorPosition } from '@collabboard/shared';
import { CURSOR_THROTTLE_MS, PRESENCE_COLORS } from '@collabboard/shared';

interface UseCursorsReturn {
  remoteCursors: UserPresence[];
  updateLocalCursor: (position: CursorPosition) => void;
}

export function useCursors(
  provider: HocuspocusProvider | null,
  userId: string,
  displayName: string,
  photoURL: string | null,
): UseCursorsReturn {
  const [remoteCursors, setRemoteCursors] = useState<UserPresence[]>([]);
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    if (!provider) return;

    const awareness = provider.awareness;
    if (!awareness) return;

    // Set local awareness state
    const colorIndex = Math.abs(hashCode(userId)) % PRESENCE_COLORS.length;
    awareness.setLocalStateField('user', {
      userId,
      displayName,
      photoURL,
      color: PRESENCE_COLORS[colorIndex],
      cursor: null,
    });

    const handleChange = (): void => {
      const states = awareness.getStates();
      const cursors: UserPresence[] = [];
      states.forEach((state, clientId) => {
        if (clientId === awareness.clientID) return;
        const user = state['user'] as UserPresence | undefined;
        if (user) {
          cursors.push(user);
        }
      });
      setRemoteCursors(cursors);
    };

    awareness.on('change', handleChange);
    handleChange();

    return () => {
      awareness.off('change', handleChange);
    };
  }, [provider, userId, displayName, photoURL]);

  const updateLocalCursor = useCallback(
    (position: CursorPosition): void => {
      if (!provider) return;
      const now = Date.now();
      if (now - lastUpdateRef.current < CURSOR_THROTTLE_MS) return;
      lastUpdateRef.current = now;

      const awareness = provider.awareness;
      if (!awareness) return;

      const current = awareness.getLocalState();
      const user = current?.['user'] as UserPresence | undefined;
      if (user) {
        awareness.setLocalStateField('user', { ...user, cursor: position });
      }
    },
    [provider],
  );

  return { remoteCursors, updateLocalCursor };
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash;
}
