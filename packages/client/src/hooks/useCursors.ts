import { useEffect, useState, useCallback, useRef } from 'react';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import type { UserPresence, CursorPosition } from '@collabboard/shared';
import { THROTTLE, PRESENCE_COLORS, logger } from '@collabboard/shared';

const log = logger('cursor');

interface UseCursorsReturn {
  remoteCursors: UserPresence[];
  updateLocalCursor: (position: CursorPosition, heavy?: boolean) => void;
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
 *     `mouse:move`. Pass `heavy: true` during group operations to use
 *     the heavier throttle interval ({@link THROTTLE.CURSOR_HEAVY_MS}).
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
      // Deduplicate by userId — a user with multiple tabs produces
      // multiple awareness clientIds but should only show one cursor.
      // Prefer the entry that has a cursor position.
      const byUserId = new Map<string, UserPresence>();
      states.forEach((state, clientId) => {
        if (clientId === awareness.clientID) return;
        const user = state['user'] as UserPresence | undefined;
        if (!user) return;
        const existing = byUserId.get(user.userId);
        if (!existing || (user.cursor && !existing.cursor)) {
          byUserId.set(user.userId, user);
        }
      });
      setRemoteCursors(Array.from(byUserId.values()));
    };

    awareness.on('change', handleChange);
    handleChange();

    return () => {
      awareness.off('change', handleChange);
    };
  }, [provider, userId, displayName, photoURL]);

  const updateLocalCursor = useCallback(
    (position: CursorPosition, heavy?: boolean): void => {
      if (!provider) return;
      const interval = heavy ? THROTTLE.CURSOR_HEAVY_MS : THROTTLE.CURSOR_MS;
      const now = performance.now();
      const elapsed = now - lastUpdateRef.current;
      if (elapsed < interval) return;
      lastUpdateRef.current = now;

      const awareness = provider.awareness;
      if (!awareness) return;

      const current = awareness.getLocalState();
      const user = current?.['user'] as UserPresence | undefined;
      if (user) {
        log.debug('broadcast', { x: position.x, y: position.y, heavy: !!heavy, interval });
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
