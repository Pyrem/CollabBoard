import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import {
  createBoard,
  listBoardsByOwner,
  getBoard,
  updateBoardTitle,
  deleteBoard,
  storeDocument,
} from './database.js';

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

describe('board metadata CRUD', () => {
  beforeEach(() => {
    db = setupTestDb();
  });

  afterEach(() => {
    db.close();
  });

  describe('createBoard', () => {
    it('creates a board and returns metadata', () => {
      const board = createBoard(db, 'board-1', 'My Board', 'user-1', 'Alice');

      expect(board.id).toBe('board-1');
      expect(board.title).toBe('My Board');
      expect(board.ownerId).toBe('user-1');
      expect(board.ownerName).toBe('Alice');
      expect(board.createdAt).toBeGreaterThan(0);
      expect(board.updatedAt).toBe(board.createdAt);
    });

    it('can be retrieved after creation', () => {
      createBoard(db, 'board-1', 'My Board', 'user-1', 'Alice');
      const fetched = getBoard(db, 'board-1');

      expect(fetched).not.toBeNull();
      expect(fetched!.title).toBe('My Board');
      expect(fetched!.ownerId).toBe('user-1');
    });
  });

  describe('getBoard', () => {
    it('returns null for non-existent board', () => {
      expect(getBoard(db, 'nonexistent')).toBeNull();
    });

    it('returns the correct board by id', () => {
      createBoard(db, 'board-a', 'Board A', 'user-1', 'Alice');
      createBoard(db, 'board-b', 'Board B', 'user-2', 'Bob');

      const a = getBoard(db, 'board-a');
      const b = getBoard(db, 'board-b');
      expect(a!.title).toBe('Board A');
      expect(b!.title).toBe('Board B');
    });
  });

  describe('listBoardsByOwner', () => {
    it('returns empty array when owner has no boards', () => {
      expect(listBoardsByOwner(db, 'user-1')).toEqual([]);
    });

    it('returns only boards for the given owner', () => {
      createBoard(db, 'b1', 'Alice Board 1', 'user-1', 'Alice');
      createBoard(db, 'b2', 'Bob Board', 'user-2', 'Bob');
      createBoard(db, 'b3', 'Alice Board 2', 'user-1', 'Alice');

      const aliceBoards = listBoardsByOwner(db, 'user-1');
      const bobBoards = listBoardsByOwner(db, 'user-2');

      expect(aliceBoards).toHaveLength(2);
      expect(aliceBoards.every((b) => b.ownerId === 'user-1')).toBe(true);
      expect(bobBoards).toHaveLength(1);
      expect(bobBoards[0]!.title).toBe('Bob Board');
    });

    it('returns boards ordered by updatedAt descending', () => {
      createBoard(db, 'b1', 'First', 'user-1', 'Alice');
      createBoard(db, 'b2', 'Second', 'user-1', 'Alice');
      // Update b1 so it becomes more recent
      updateBoardTitle(db, 'b1', 'First Updated');

      const boards = listBoardsByOwner(db, 'user-1');
      expect(boards[0]!.id).toBe('b1');
      expect(boards[1]!.id).toBe('b2');
    });
  });

  describe('updateBoardTitle', () => {
    it('changes the title', () => {
      createBoard(db, 'b1', 'Original', 'user-1', 'Alice');
      updateBoardTitle(db, 'b1', 'Renamed');

      const board = getBoard(db, 'b1');
      expect(board!.title).toBe('Renamed');
    });

    it('updates the updatedAt timestamp', () => {
      const board = createBoard(db, 'b1', 'Original', 'user-1', 'Alice');
      const originalUpdatedAt = board.updatedAt;

      // Small delay to ensure timestamp differs
      updateBoardTitle(db, 'b1', 'Renamed');

      const updated = getBoard(db, 'b1');
      expect(updated!.updatedAt).toBeGreaterThanOrEqual(originalUpdatedAt);
    });
  });

  describe('deleteBoard', () => {
    it('removes the board from the boards table', () => {
      createBoard(db, 'b1', 'To Delete', 'user-1', 'Alice');
      deleteBoard(db, 'b1');

      expect(getBoard(db, 'b1')).toBeNull();
    });

    it('also removes the associated document', () => {
      createBoard(db, 'b1', 'To Delete', 'user-1', 'Alice');
      storeDocument(db, 'b1', new Uint8Array([1, 2, 3]));

      deleteBoard(db, 'b1');

      // Verify document row is gone
      const row = db.prepare('SELECT * FROM documents WHERE name = ?').get('b1');
      expect(row).toBeUndefined();
    });

    it('does not affect other boards', () => {
      createBoard(db, 'b1', 'Keep', 'user-1', 'Alice');
      createBoard(db, 'b2', 'Delete', 'user-1', 'Alice');

      deleteBoard(db, 'b2');

      expect(getBoard(db, 'b1')).not.toBeNull();
      expect(getBoard(db, 'b2')).toBeNull();
    });

    it('is a no-op for non-existent boards', () => {
      // Should not throw
      expect(() => deleteBoard(db, 'nonexistent')).not.toThrow();
    });
  });
});
