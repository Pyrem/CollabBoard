import { useEffect, useState, useCallback, useRef } from 'react';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import type { UserPresence, CursorPosition } from '@collabboard/shared';
import { CURSOR_THROTTLE_MS, PRESENCE_COLORS } from '@collabboard/shared';

interface UseCursorsReturn {
  remoteCursors: UserPresence[];
  updateLocalCursor: (position: CursorPosition) => void;
}

/**
 * Broadcast the local user's cursor position and receive remote cursors
 * via the Yjs awareness protocol.
 *
 * On mount the local awareness state is initialised with the user's identity
 * and a deterministic color derived from `userId`. Remote cursor positions are
 * collected into the returned `remoteCursors` array whenever awareness changes.
 *
 * @param provider - Hocuspocus provider whose `awareness` instance is used.
 *   Pass `null` before the connection is ready; the hook becomes a no-op.
 * @param userId - Firebase UID for the local user.
 * @param displayName - Display name shown on the cursor label.
 * @param photoURL - Avatar URL (nullable) included in presence state.
 * @returns
 *   - `remoteCursors` — array of {@link UserPresence} objects for every
 *     other connected client (excludes the local client).
 *   - `updateLocalCursor` — call with a canvas-space `{ x, y }` on
 *     `mouse:move`; throttled to {@link CURSOR_THROTTLE_MS} internally.
 */
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
      const now = performance.now();
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

/** Simple string hash used to pick a deterministic color from {@link PRESENCE_COLORS}. */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash;
}
