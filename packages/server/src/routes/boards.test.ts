import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';
import type { Request, Response, NextFunction } from 'express';
import type { BoardMetadata } from '@collabboard/shared';
import { createBoardRouter } from './boards.js';

// ─── Test helpers ────────────────────────────────────────────────────

let db: BetterSqlite3.Database;

function setupTestDb(): BetterSqlite3.Database {
  const testDb = new BetterSqlite3(':memory:');
  testDb.pragma('journal_mode = WAL');
  testDb.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      name TEXT PRIMARY KEY,
      data BLOB NOT NULL
    )
  `);
  testDb.exec(`
    CREATE TABLE IF NOT EXISTS boards (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'Untitled Board',
      owner_id TEXT NOT NULL,
      owner_name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  testDb.exec('CREATE INDEX IF NOT EXISTS idx_boards_owner ON boards(owner_id)');
  return testDb;
}

/** Fake auth middleware that sets userId/displayName from custom headers. */
function fakeAuth(req: Request, res: Response, next: NextFunction): void {
  const userId = req.headers['x-test-user-id'] as string | undefined;
  if (!userId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  (req as Record<string, unknown>)['userId'] = userId;
  (req as Record<string, unknown>)['displayName'] =
    (req.headers['x-test-display-name'] as string | undefined) ?? 'Test User';
  next();
}

function createApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/boards', fakeAuth, createBoardRouter(db));
  return app;
}

/** Supertest agent with auth headers pre-set. */
function authedAgent(
  app: express.Express,
  userId = 'user-1',
  displayName = 'Alice',
): request.Agent {
  return request.agent(app).set('x-test-user-id', userId).set('x-test-display-name', displayName);
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('Board routes', () => {
  let app: express.Express;

  beforeEach(() => {
    db = setupTestDb();
    app = createApp();
  });

  afterEach(() => {
    db.close();
  });

  // ── Auth ──────────────────────────────────────────────────────────

  describe('authentication', () => {
    it('returns 401 when no auth header is provided', async () => {
      const res = await request(app).get('/api/boards');
      expect(res.status).toBe(401);
    });
  });

  // ── POST /api/boards ─────────────────────────────────────────────

  describe('POST /api/boards', () => {
    it('creates a board with a given title', async () => {
      const res = await authedAgent(app).post('/api/boards').send({ title: 'My Board' });

      expect(res.status).toBe(201);
      const body = res.body as BoardMetadata;
      expect(body.title).toBe('My Board');
      expect(body.ownerId).toBe('user-1');
      expect(body.ownerName).toBe('Alice');
      expect(body.id).toBeTruthy();
      expect(body.createdAt).toBeGreaterThan(0);
    });

    it('defaults title to "Untitled Board" when not provided', async () => {
      const res = await authedAgent(app).post('/api/boards').send({});

      expect(res.status).toBe(201);
      expect((res.body as BoardMetadata).title).toBe('Untitled Board');
    });

    it('trims whitespace from title', async () => {
      const res = await authedAgent(app).post('/api/boards').send({ title: '  Spaced  ' });

      expect(res.status).toBe(201);
      expect((res.body as BoardMetadata).title).toBe('Spaced');
    });

    it('defaults title when title is empty string', async () => {
      const res = await authedAgent(app).post('/api/boards').send({ title: '   ' });

      expect(res.status).toBe(201);
      expect((res.body as BoardMetadata).title).toBe('Untitled Board');
    });
  });

  // ── GET /api/boards ──────────────────────────────────────────────

  describe('GET /api/boards', () => {
    it('returns empty array when user has no boards', async () => {
      const res = await authedAgent(app).get('/api/boards');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns only the authenticated user boards', async () => {
      await authedAgent(app, 'user-1').post('/api/boards').send({ title: 'A1' });
      await authedAgent(app, 'user-1').post('/api/boards').send({ title: 'A2' });
      await authedAgent(app, 'user-2', 'Bob').post('/api/boards').send({ title: 'B1' });

      const res = await authedAgent(app, 'user-1').get('/api/boards');

      expect(res.status).toBe(200);
      const boards = res.body as BoardMetadata[];
      expect(boards).toHaveLength(2);
      expect(boards.every((b) => b.ownerId === 'user-1')).toBe(true);
    });
  });

  // ── GET /api/boards/:id ──────────────────────────────────────────

  describe('GET /api/boards/:id', () => {
    it('returns a board by id', async () => {
      const created = (
        await authedAgent(app).post('/api/boards').send({ title: 'Test' })
      ).body as BoardMetadata;

      const res = await authedAgent(app).get(`/api/boards/${created.id}`);

      expect(res.status).toBe(200);
      expect((res.body as BoardMetadata).title).toBe('Test');
    });

    it('returns 404 for non-existent board', async () => {
      const res = await authedAgent(app).get('/api/boards/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  // ── PATCH /api/boards/:id ────────────────────────────────────────

  describe('PATCH /api/boards/:id', () => {
    it('renames the board', async () => {
      const created = (
        await authedAgent(app).post('/api/boards').send({ title: 'Old' })
      ).body as BoardMetadata;

      const res = await authedAgent(app)
        .patch(`/api/boards/${created.id}`)
        .send({ title: 'New' });

      expect(res.status).toBe(200);
      expect((res.body as BoardMetadata).title).toBe('New');
    });

    it('returns 404 for non-existent board', async () => {
      const res = await authedAgent(app)
        .patch('/api/boards/nonexistent')
        .send({ title: 'X' });
      expect(res.status).toBe(404);
    });

    it('returns 403 when non-owner tries to rename', async () => {
      const created = (
        await authedAgent(app, 'user-1').post('/api/boards').send({ title: 'Mine' })
      ).body as BoardMetadata;

      const res = await authedAgent(app, 'user-2', 'Bob')
        .patch(`/api/boards/${created.id}`)
        .send({ title: 'Stolen' });

      expect(res.status).toBe(403);

      // Verify title unchanged
      const check = await authedAgent(app).get(`/api/boards/${created.id}`);
      expect((check.body as BoardMetadata).title).toBe('Mine');
    });

    it('keeps existing title when no title provided', async () => {
      const created = (
        await authedAgent(app).post('/api/boards').send({ title: 'Keep' })
      ).body as BoardMetadata;

      const res = await authedAgent(app).patch(`/api/boards/${created.id}`).send({});

      expect(res.status).toBe(200);
      expect((res.body as BoardMetadata).title).toBe('Keep');
    });
  });

  // ── DELETE /api/boards/:id ───────────────────────────────────────

  describe('DELETE /api/boards/:id', () => {
    it('deletes the board', async () => {
      const created = (
        await authedAgent(app).post('/api/boards').send({ title: 'Delete Me' })
      ).body as BoardMetadata;

      const res = await authedAgent(app).delete(`/api/boards/${created.id}`);
      expect(res.status).toBe(204);

      // Verify it's gone
      const check = await authedAgent(app).get(`/api/boards/${created.id}`);
      expect(check.status).toBe(404);
    });

    it('returns 404 for non-existent board', async () => {
      const res = await authedAgent(app).delete('/api/boards/nonexistent');
      expect(res.status).toBe(404);
    });

    it('returns 403 when non-owner tries to delete', async () => {
      const created = (
        await authedAgent(app, 'user-1').post('/api/boards').send({ title: 'Mine' })
      ).body as BoardMetadata;

      const res = await authedAgent(app, 'user-2', 'Bob').delete(
        `/api/boards/${created.id}`,
      );

      expect(res.status).toBe(403);

      // Verify it still exists
      const check = await authedAgent(app).get(`/api/boards/${created.id}`);
      expect(check.status).toBe(200);
    });

    it('also removes associated document data', async () => {
      const created = (
        await authedAgent(app).post('/api/boards').send({ title: 'With Doc' })
      ).body as BoardMetadata;

      // Simulate a stored Yjs document
      db.prepare('INSERT INTO documents (name, data) VALUES (?, ?)').run(
        created.id,
        Buffer.from([1, 2, 3]),
      );

      await authedAgent(app).delete(`/api/boards/${created.id}`);

      const row = db.prepare('SELECT * FROM documents WHERE name = ?').get(created.id);
      expect(row).toBeUndefined();
    });
  });
});
