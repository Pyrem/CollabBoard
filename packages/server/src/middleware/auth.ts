import type { Request, Response, NextFunction } from 'express';
import { getAuth } from '../hocuspocus/firebaseAdmin.js';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  displayName?: string;
}

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
