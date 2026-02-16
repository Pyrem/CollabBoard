import { useEffect, useState } from 'react';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import type { UserPresence } from '@collabboard/shared';

export function usePresence(provider: HocuspocusProvider | null): UserPresence[] {
  const [users, setUsers] = useState<UserPresence[]>([]);

  useEffect(() => {
    if (!provider) return;

    const awareness = provider.awareness;
    if (!awareness) return;

    const handleChange = (): void => {
      const states = awareness.getStates();
      const onlineUsers: UserPresence[] = [];
      states.forEach((state) => {
        const user = state['user'] as UserPresence | undefined;
        if (user) {
          onlineUsers.push(user);
        }
      });
      setUsers(onlineUsers);
    };

    awareness.on('change', handleChange);
    handleChange();

    return () => {
      awareness.off('change', handleChange);
    };
  }, [provider]);

  return users;
}
