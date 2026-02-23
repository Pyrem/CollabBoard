import { Router } from 'express';
import { generateId } from '@collabboard/shared';
import type BetterSqlite3 from 'better-sqlite3';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  createBoard,
  listBoardsByOwner,
  getBoard,
  updateBoardTitle,
  deleteBoard,
} from '../hocuspocus/database.js';

export function createBoardRouter(db: BetterSqlite3.Database): Router {
  const router = Router();

  // POST /api/boards — create a new board
  router.post('/', (req, res) => {
    const { userId, displayName } = req as AuthenticatedRequest;
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const title =
      typeof req.body?.title === 'string' && req.body.title.trim()
        ? req.body.title.trim()
        : 'Untitled Board';
    const board = createBoard(db, generateId(), title, userId, displayName ?? 'Anonymous');
    res.status(201).json(board);
  });

  // GET /api/boards — list boards for the authenticated user
  router.get('/', (req, res) => {
    const { userId } = req as AuthenticatedRequest;
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const boards = listBoardsByOwner(db, userId);
    res.json(boards);
  });

  // GET /api/boards/:id — get a single board
  router.get('/:id', (req, res) => {
    const board = getBoard(db, req.params['id']!);
    if (!board) {
      res.status(404).json({ error: 'Board not found' });
      return;
    }
    res.json(board);
  });

  // PATCH /api/boards/:id — rename a board
  router.patch('/:id', (req, res) => {
    const { userId } = req as AuthenticatedRequest;
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const board = getBoard(db, req.params['id']!);
    if (!board) {
      res.status(404).json({ error: 'Board not found' });
      return;
    }
    if (board.ownerId !== userId) {
      res.status(403).json({ error: 'Not the board owner' });
      return;
    }
    const title =
      typeof req.body?.title === 'string' && req.body.title.trim()
        ? req.body.title.trim()
        : board.title;
    updateBoardTitle(db, board.id, title);
    const updated = getBoard(db, board.id);
    res.json(updated);
  });

  // DELETE /api/boards/:id — delete a board
  router.delete('/:id', (req, res) => {
    const { userId } = req as AuthenticatedRequest;
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const board = getBoard(db, req.params['id']!);
    if (!board) {
      res.status(404).json({ error: 'Board not found' });
      return;
    }
    if (board.ownerId !== userId) {
      res.status(403).json({ error: 'Not the board owner' });
      return;
    }
    deleteBoard(db, board.id);
    res.status(204).send();
  });

  return router;
}
