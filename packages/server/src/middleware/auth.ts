import type { Request, Response, NextFunction } from 'express';
import { getAuth } from '../hocuspocus/firebaseAdmin.js';

/**
 * Express `Request` augmented with Firebase user info after token verification.
 *
 * Fields are optional because they are only populated after
 * {@link authMiddleware} successfully verifies the JWT. Downstream handlers
 * (e.g. {@link aiCommandHandler}) can safely read `req.userId` knowing the
 * middleware has already run.
 */
export interface AuthenticatedRequest extends Request {
  userId?: string;
  displayName?: string;
}

/**
 * Express middleware that verifies a Firebase ID token from the
 * `Authorization: Bearer <token>` header.
 *
 * On success, attaches `userId` and `displayName` to the request object
 * (typed as {@link AuthenticatedRequest}) and calls `next()`. On failure,
 * responds with `401 Unauthorized` and a JSON error body — the request
 * is not forwarded to downstream handlers.
 *
 * @param req - Incoming Express request (cast to {@link AuthenticatedRequest}).
 * @param res - Express response — used only to send 401 on failure.
 * @param next - Express `next()` callback — called on successful verification.
 * @returns Resolves after either responding with 401 or calling `next()`.
 *
 * @example
 * app.post('/api/ai-command', authMiddleware, handler);
 *
 * @see {@link getAuth} for the Firebase Admin SDK singleton used for verification.
 */
export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const auth = getAuth();
    const decoded = await auth.verifyIdToken(token);
    req.userId = decoded.uid;
    req.displayName = decoded.name as string | undefined;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}
