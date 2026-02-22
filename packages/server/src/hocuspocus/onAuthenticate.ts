import type { onAuthenticatePayload } from '@hocuspocus/server';
import { getAuth } from './firebaseAdmin.js';

/**
 * Hocuspocus `onAuthenticate` hook — invoked for every new WebSocket connection.
 *
 * Extracts the `token` from the connection payload, verifies it against
 * Firebase Admin SDK via {@link getAuth}, and on success attaches the decoded
 * user identity (`userId`, `displayName`, `photoURL`, `email`) to
 * `data.context` so downstream hooks and the awareness protocol can read it.
 * The connection is marked read-write (`readOnly = false`).
 *
 * Throws an `Error` (which Hocuspocus translates into a WebSocket close frame)
 * if the token is missing or invalid, preventing unauthenticated access.
 *
 * @param data - Hocuspocus authentication payload containing the client-sent
 *   `token`, the mutable `connection` object, and a shared `context` bag.
 * @returns Resolves when the token has been verified and context populated.
 * @throws {Error} `"Authentication required"` when no token is provided.
 * @throws {Error} `"Invalid authentication token"` when Firebase rejects the JWT.
 *
 * @example
 * // Registered in the Hocuspocus server configuration:
 * const server = Server.configure({ onAuthenticate });
 *
 * @see {@link getAuth} for Firebase Admin SDK initialisation.
 */
export async function onAuthenticate(data: onAuthenticatePayload): Promise<void> {
  const { token } = data;

  if (!token) {
    throw new Error('Authentication required');
  }

  try {
    const auth = getAuth();
    const decodedToken = await auth.verifyIdToken(token);
    // Attach user info to connection context
    data.connection.readOnly = false;
    // Store user info in context for use by other hooks
    Object.assign(data.context, {
      userId: decodedToken.uid,
      displayName: decodedToken.name ?? 'Anonymous',
      photoURL: decodedToken.picture ?? null,
      email: decodedToken.email ?? null,
    });
  } catch {
    throw new Error('Invalid authentication token');
  }
}
