import type { onAuthenticatePayload } from '@hocuspocus/server';
import { getAuth } from './firebaseAdmin.js';

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
