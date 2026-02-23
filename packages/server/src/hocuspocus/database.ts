import BetterSqlite3 from 'better-sqlite3';
import path from 'path';
import type { BoardMetadata } from '@collabboard/shared';


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
  db.exec(`
    CREATE TABLE IF NOT EXISTS boards (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'Untitled Board',
      owner_id TEXT NOT NULL,
      owner_name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_boards_owner ON boards(owner_id)');

  // Migrate: add thumbnail column if it doesn't exist yet
  const cols = db.prepare("PRAGMA table_info('boards')").all() as { name: string }[];
  if (!cols.some((c) => c.name === 'thumbnail')) {
    db.exec('ALTER TABLE boards ADD COLUMN thumbnail BLOB');
  }

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

// ─── Board metadata CRUD ─────────────────────────────────────────────

interface BoardRow {
  id: string;
  title: string;
  owner_id: string;
  owner_name: string;
  created_at: number;
  updated_at: number;
  has_thumbnail: number;
}

function rowToMetadata(row: BoardRow): BoardMetadata {
  return {
    id: row.id,
    title: row.title,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    hasThumbnail: row.has_thumbnail === 1,
  };
}

export function createBoard(
  db: BetterSqlite3.Database,
  id: string,
  title: string,
  ownerId: string,
  ownerName: string,
): BoardMetadata {
  const now = Date.now();
  db.prepare(
    'INSERT INTO boards (id, title, owner_id, owner_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, title, ownerId, ownerName, now, now);
  return { id, title, ownerId, ownerName, createdAt: now, updatedAt: now, hasThumbnail: false };
}

export function listBoardsByOwner(
  db: BetterSqlite3.Database,
  ownerId: string,
): BoardMetadata[] {
  const rows = db
    .prepare(
      'SELECT id, title, owner_id, owner_name, created_at, updated_at, (thumbnail IS NOT NULL) AS has_thumbnail FROM boards WHERE owner_id = ? ORDER BY updated_at DESC',
    )
    .all(ownerId) as BoardRow[];
  return rows.map(rowToMetadata);
}

export function getBoard(
  db: BetterSqlite3.Database,
  id: string,
): BoardMetadata | null {
  const row = db
    .prepare(
      'SELECT id, title, owner_id, owner_name, created_at, updated_at, (thumbnail IS NOT NULL) AS has_thumbnail FROM boards WHERE id = ?',
    )
    .get(id) as BoardRow | undefined;
  if (!row) return null;
  return rowToMetadata(row);
}

export function updateBoardTitle(
  db: BetterSqlite3.Database,
  id: string,
  title: string,
): void {
  const now = Date.now();
  db.prepare('UPDATE boards SET title = ?, updated_at = ? WHERE id = ?').run(title, now, id);
}

export function deleteBoard(
  db: BetterSqlite3.Database,
  id: string,
): void {
  const del = db.transaction(() => {
    db.prepare('DELETE FROM boards WHERE id = ?').run(id);
    db.prepare('DELETE FROM documents WHERE name = ?').run(id);
  });
  del();
}

// ─── Thumbnail CRUD ───────────────────────────────────────────────────

export function updateBoardThumbnail(
  db: BetterSqlite3.Database,
  id: string,
  thumbnail: Buffer,
): void {
  db.prepare('UPDATE boards SET thumbnail = ? WHERE id = ?').run(thumbnail, id);
}

export function getBoardThumbnail(
  db: BetterSqlite3.Database,
  id: string,
): Buffer | null {
  const row = db.prepare('SELECT thumbnail FROM boards WHERE id = ?').get(id) as
    | { thumbnail: Buffer | null }
    | undefined;
  if (!row?.thumbnail) return null;
  return row.thumbnail;
}
