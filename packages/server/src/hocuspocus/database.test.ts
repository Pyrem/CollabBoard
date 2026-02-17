import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { loadDocument, storeDocument } from './database.js';

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
  return testDb;
}

describe('database', () => {
  beforeEach(() => {
    db = setupTestDb();
  });

  afterEach(() => {
    db.close();
  });

  describe('loadDocument', () => {
    it('returns null for non-existent document', () => {
      const result = loadDocument(db, 'nonexistent');
      expect(result).toBeNull();
    });

    it('returns stored document data', () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      storeDocument(db, 'test-doc', data);

      const result = loadDocument(db, 'test-doc');
      expect(result).toBeDefined();
      expect(result).toEqual(data);
    });
  });

  describe('storeDocument', () => {
    it('stores a new document', () => {
      const data = new Uint8Array([10, 20, 30]);
      storeDocument(db, 'doc-1', data);

      const result = loadDocument(db, 'doc-1');
      expect(result).toEqual(data);
    });

    it('overwrites an existing document', () => {
      const data1 = new Uint8Array([1, 2, 3]);
      const data2 = new Uint8Array([4, 5, 6]);

      storeDocument(db, 'doc-1', data1);
      storeDocument(db, 'doc-1', data2);

      const result = loadDocument(db, 'doc-1');
      expect(result).toEqual(data2);
    });

    it('stores multiple documents independently', () => {
      const data1 = new Uint8Array([1]);
      const data2 = new Uint8Array([2]);

      storeDocument(db, 'doc-a', data1);
      storeDocument(db, 'doc-b', data2);

      expect(loadDocument(db, 'doc-a')).toEqual(data1);
      expect(loadDocument(db, 'doc-b')).toEqual(data2);
    });

    it('handles empty data', () => {
      const data = new Uint8Array([]);
      storeDocument(db, 'empty-doc', data);

      const result = loadDocument(db, 'empty-doc');
      expect(result).toEqual(data);
    });

    it('handles large binary data', () => {
      const data = new Uint8Array(100_000);
      for (let i = 0; i < data.length; i++) {
        data[i] = i % 256;
      }
      storeDocument(db, 'large-doc', data);

      const result = loadDocument(db, 'large-doc');
      expect(result).toEqual(data);
    });
  });
});
