import BetterSqlite3 from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env['DB_PATH'] ?? path.join(process.cwd(), 'collabboard.sqlite');

/** Open (or create) the SQLite database and ensure the `documents` table exists. */
export function setupDatabase(): BetterSqlite3.Database {
  const db = new BetterSqlite3(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      name TEXT PRIMARY KEY,
      data BLOB NOT NULL
    )
  `);
  console.log(`[DB] SQLite database initialized at ${DB_PATH}`);
  return db;
}

/** Load a Yjs document snapshot from SQLite by name. Returns `null` if not found. */
export function loadDocument(
  db: BetterSqlite3.Database,
  documentName: string,
): Uint8Array | null {
  const row = db.prepare('SELECT data FROM documents WHERE name = ?').get(documentName) as
    | { data: Buffer }
    | undefined;
  if (!row) return null;
  return new Uint8Array(row.data);
}

/** Persist a Yjs document snapshot to SQLite (insert or replace). */
export function storeDocument(
  db: BetterSqlite3.Database,
  documentName: string,
  state: Uint8Array,
): void {
  db.prepare('INSERT OR REPLACE INTO documents (name, data) VALUES (?, ?)').run(
    documentName,
    Buffer.from(state),
  );
}
