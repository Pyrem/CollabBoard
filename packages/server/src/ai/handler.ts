import type { Request, Response } from 'express';
import type { Hocuspocus } from '@hocuspocus/server';
import type { AuthenticatedRequest } from '../middleware/auth.js';

// Stub AI command handler — will be implemented post-MVP
export function aiCommandHandler(
  _hocuspocus: Hocuspocus,
): (req: Request, res: Response) => void {
  return (req: Request, res: Response): void => {
    const authReq = req as AuthenticatedRequest;
    const { command, boardId } = req.body as { command?: string; boardId?: string };

    if (!command || !boardId) {
      res.status(400).json({ error: 'Missing command or boardId' });
      return;
    }

    // TODO: Implement AI agent post-MVP
    res.json({
      message: 'AI agent not yet implemented',
      userId: authReq.userId,
      command,
      boardId,
    });
  };
}
