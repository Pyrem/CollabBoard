import { useEffect, useState } from 'react';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import type { UserPresence } from '@collabboard/shared';

/**
 * Subscribe to the list of currently online users via Yjs awareness.
 *
 * Returns a reactive array of {@link UserPresence} objects — one per connected
 * client (including the local user). The array updates whenever any client
 * joins, leaves, or changes their awareness state.
 *
 * @param provider - Hocuspocus provider. Pass `null` before the connection is
 *   ready; the hook returns an empty array.
 * @returns All online users as `UserPresence[]`.
 */
export function usePresence(provider: HocuspocusProvider | null): UserPresence[] {
  const [users, setUsers] = useState<UserPresence[]>([]);

  useEffect(() => {
    if (!provider) return;

    const awareness = provider.awareness;
    if (!awareness) return;

    const handleChange = (): void => {
      const states = awareness.getStates();
      // Deduplicate by userId — a user with multiple tabs produces
      // multiple awareness entries but should only appear once.
      const byUserId = new Map<string, UserPresence>();
      states.forEach((state) => {
        const user = state['user'] as UserPresence | undefined;
        if (user) {
          byUserId.set(user.userId, user);
        }
      });
      setUsers(Array.from(byUserId.values()));
    };

    awareness.on('change', handleChange);
    handleChange();

    return () => {
      awareness.off('change', handleChange);
    };
  }, [provider]);

  return users;
}
