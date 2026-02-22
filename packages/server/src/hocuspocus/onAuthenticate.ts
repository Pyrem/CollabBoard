import type { onAuthenticatePayload } from '@hocuspocus/server';
import { getAuth } from './firebaseAdmin.js';
import type { ConnectionLimiter, ConnectionToken } from '../middleware/connectionLimiter.js';

/**
 * Create a Hocuspocus `onAuthenticate` hook that verifies Firebase JWTs
 * and enforces per-user WebSocket connection limits.
 *
 * @param connectionLimiter - Optional {@link ConnectionLimiter} instance.
 *   When provided, the hook reads the connection token attached to the
 *   incoming request during the `upgrade` event and calls
 *   {@link ConnectionLimiter.associateUser} to enforce per-user limits.
 *   If the limit is exceeded the connection is rejected.
 *
 * @returns An async `onAuthenticate` handler suitable for
 *   `Server.configure({ onAuthenticate })`.
 */
export function createOnAuthenticate(
  connectionLimiter?: ConnectionLimiter,
): (data: onAuthenticatePayload) => Promise<void> {
  return async (data: onAuthenticatePayload): Promise<void> => {
    const { token } = data;

    if (!token) {
      throw new Error('Authentication required');
    }

    try {
      const auth = getAuth();
      const decodedToken = await auth.verifyIdToken(token);

      // Enforce per-user connection limit
      if (connectionLimiter) {
        const request = data.request as unknown as Record<string, unknown> | undefined;
        const connToken = request?.['__connectionToken'] as ConnectionToken | undefined;

        if (connToken && !connectionLimiter.associateUser(connToken, decodedToken.uid)) {
          throw new Error('Connection limit reached for this user');
        }
      }

      // Attach user info to connection context
      data.connection.readOnly = false;
      Object.assign(data.context, {
        userId: decodedToken.uid,
        displayName: decodedToken.name ?? 'Anonymous',
        photoURL: decodedToken.picture ?? null,
        email: decodedToken.email ?? null,
      });
    } catch (err) {
      // Re-throw our own limit error as-is
      if (err instanceof Error && err.message === 'Connection limit reached for this user') {
        throw err;
      }
      throw new Error('Invalid authentication token');
    }
  };
}

/**
 * Default `onAuthenticate` hook without connection limiting.
 *
 * @deprecated Prefer {@link createOnAuthenticate} with a
 *   {@link ConnectionLimiter} for production use.
 */
export async function onAuthenticate(data: onAuthenticatePayload): Promise<void> {
  return createOnAuthenticate()(data);
}
