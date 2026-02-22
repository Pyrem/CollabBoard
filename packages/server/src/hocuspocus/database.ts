import BetterSqlite3 from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env['DB_PATH'] ?? path.join(process.cwd(), 'collabboard.sqlite');

/**
 * Open (or create) the SQLite database and ensure the `documents` table exists.
 *
 * The database path is read from `process.env.DB_PATH`, falling back to
 * `<cwd>/collabboard.sqlite`. WAL journal mode is enabled for concurrent
 * read performance. The `documents` table stores Yjs binary snapshots
 * keyed by document name.
 *
 * @returns An open `better-sqlite3` `Database` handle. The caller is
 *   responsible for closing it during shutdown.
 *
 * @example
 * const db = setupDatabase();
 * // later, during graceful shutdown:
 * db.close();
 */
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

/**
 * Load a Yjs document snapshot from SQLite by document name.
 *
 * Called by the Hocuspocus `Database` extension's `fetch` callback
 * whenever a document is first opened (or re-opened after eviction).
 * The returned `Uint8Array` is fed into `Y.applyUpdate` by Hocuspocus
 * to rehydrate the in-memory `Y.Doc`.
 *
 * @param db - Open `better-sqlite3` database handle.
 * @param documentName - Hocuspocus document / room name (doubles as the
 *   board ID on the client).
 * @returns The raw Yjs state vector as a `Uint8Array`, or `null` if no
 *   snapshot exists for the given name.
 */
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

/**
 * Persist a Yjs document snapshot to SQLite (insert-or-replace).
 *
 * Called by the Hocuspocus `Database` extension's `store` callback after
 * the document's debounce window expires. The `state` is the full Yjs
 * binary encoding produced by `Y.encodeStateAsUpdate`.
 *
 * @param db - Open `better-sqlite3` database handle.
 * @param documentName - Hocuspocus document / room name (board ID).
 * @param state - Yjs binary snapshot to persist.
 */
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
