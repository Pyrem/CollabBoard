# Dashboard + Multi-Board Implementation Plan

Each step is self-contained and testable before moving to the next.

---

## Step 1 — Shared type: `BoardMetadata`

**File**: `packages/shared/src/types.ts`

Add after the `UserPresence` interface:

```ts
/** Metadata for a board (stored in SQLite, separate from the Yjs document blob). */
export interface BoardMetadata {
  id: string;           // UUID v4 — same key used in documents.name
  title: string;        // user-facing board name
  ownerId: string;      // Firebase UID of the creator
  ownerName: string;    // display name at creation time
  createdAt: number;    // epoch ms
  updatedAt: number;    // epoch ms
}
```

**Validate**: `pnpm --filter @collabboard/shared run build`

---

## Step 2 — Database: `boards` table + CRUD helpers

**File**: `packages/server/src/hocuspocus/database.ts`

### 2a. Schema — add inside `setupDatabase()`:

```sql
CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Untitled Board',
  owner_id TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_boards_owner ON boards(owner_id);
```

### 2b. New functions:

| Function | Returns | SQL |
|----------|---------|-----|
| `createBoard(db, id, title, ownerId, ownerName)` | `BoardMetadata` | `INSERT INTO boards` |
| `listBoardsByOwner(db, ownerId)` | `BoardMetadata[]` | `SELECT ... WHERE owner_id = ? ORDER BY updated_at DESC` |
| `getBoard(db, id)` | `BoardMetadata \| null` | `SELECT ... WHERE id = ?` |
| `updateBoardTitle(db, id, title)` | `void` | `UPDATE SET title, updated_at WHERE id = ?` |
| `deleteBoard(db, id)` | `void` | Transaction: `DELETE FROM boards` + `DELETE FROM documents` |

Row → `BoardMetadata` mapping: `{ id: row.id, title: row.title, ownerId: row.owner_id, ... }`

### 2c. Tests

**New file**: `packages/server/src/hocuspocus/database.boards.test.ts`

- createBoard → getBoard returns it
- listBoardsByOwner returns only that owner's boards (insert boards for 2 owners, verify isolation)
- updateBoardTitle changes title + updates `updatedAt`
- deleteBoard removes both `boards` and `documents` rows
- getBoard returns null for non-existent ID

**Validate**: `pnpm --filter @collabboard/server run test`

---

## Step 3 — Server REST API: board endpoints

**New file**: `packages/server/src/routes/boards.ts`

Export a factory function `boardsRouter(db)` that returns an `express.Router`.
All routes are behind `authMiddleware` (applied at the `app.use` level in index.ts).

### Endpoints:

**POST /** — Create board
- Body: `{ title?: string }`
- Generate ID via `crypto.randomUUID()`
- `createBoard(db, id, title ?? 'Untitled Board', req.userId, req.displayName ?? 'Anonymous')`
- Response: `201 { board: BoardMetadata }`

**GET /** — List my boards
- `listBoardsByOwner(db, req.userId)`
- Response: `200 { boards: BoardMetadata[] }`

**GET /:id** — Get board metadata
- `getBoard(db, id)` — any authenticated user can read metadata
- Response: `200 { board }` or `404 { error: 'Board not found' }`

**PATCH /:id** — Rename board
- Body: `{ title: string }`
- Verify `board.ownerId === req.userId` → 403 if not owner
- `updateBoardTitle(db, id, title)`
- Response: `200 { board }` (re-fetched)

**DELETE /:id** — Delete board
- Verify `board.ownerId === req.userId` → 403 if not owner
- `deleteBoard(db, id)`
- Response: `200 { deleted: true }`

### Registration in `packages/server/src/index.ts`:

```ts
import { boardsRouter } from './routes/boards.js';
// After existing middleware setup:
app.use('/api/boards', authMiddleware, boardsRouter(db));
```

### Tests

**New file**: `packages/server/src/routes/boards.test.ts`

Use supertest against an Express app with in-memory SQLite. Mock `authMiddleware`
to inject a test userId. Test all 5 endpoints + ownership enforcement (403 on
rename/delete by non-owner).

**Validate**: `pnpm --filter @collabboard/server run test`

---

## Step 4 — Client API helper

**New file**: `packages/client/src/lib/api.ts`

### Base client:

```ts
async function apiClient(path: string, options?: RequestInit): Promise<Response> {
  const token = await auth.currentUser?.getIdToken();
  const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
}
```

### Typed wrappers:

```ts
export async function createBoard(title?: string): Promise<BoardMetadata>
export async function listMyBoards(): Promise<BoardMetadata[]>
export async function getBoard(id: string): Promise<BoardMetadata>
export async function updateBoardTitle(id: string, title: string): Promise<BoardMetadata>
export async function deleteBoard(id: string): Promise<void>
```

Each calls `apiClient`, checks `response.ok`, parses JSON, and returns
the typed result. Throws on non-ok status.

**Validate**: `pnpm --filter @collabboard/client run typecheck`

---

## Step 5 — Dashboard page

**New file**: `packages/client/src/components/Dashboard/DashboardPage.tsx`

### Layout (matches LoginPage visual style):

```
┌──────────────────────────────────────────┐
│  CollabBoard          [user] [Sign Out]  │
├──────────────────────────────────────────┤
│                                          │
│  [+ Create Board]      [Join by ID...]   │
│                                          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │ Board 1 │ │ Board 2 │ │ Board 3 │   │
│  │ Created  │ │ Created  │ │ Created  │   │
│  │ Jan 15   │ │ Feb 2    │ │ Feb 20   │   │
│  │  [✎] [🗑]│ │  [✎] [🗑]│ │  [✎] [🗑]│   │
│  └─────────┘ └─────────┘ └─────────┘   │
│                                          │
│  Empty state: "No boards yet..."         │
└──────────────────────────────────────────┘
```

### State:

- `boards: BoardMetadata[]` — fetched on mount via `listMyBoards()`
- `loading: boolean` — shows skeleton/spinner while fetching
- `error: string | null`

### Actions:

- **Create**: prompt/inline input for title → `createBoard(title)` → navigate to `/board/:id`
- **Open**: click card → `navigate('/board/' + board.id)`
- **Rename**: pencil icon → inline input → `updateBoardTitle(id, newTitle)` → re-fetch list
- **Delete**: trash icon → confirm dialog ("Delete [title]? This cannot be undone.") → `deleteBoard(id)` → remove from local state
- **Join**: input field for board ID/URL → navigate to `/board/:id`
- **Sign out**: `signOut(auth)` → navigate to `/login`

**Validate**: Visual — dev server, log in, see dashboard.

---

## Step 6 — Routing update

### `packages/client/src/App.tsx`:

- Add dashboard route:
  ```tsx
  <Route path="/dashboard" element={<AuthGuard><DashboardPage /></AuthGuard>} />
  ```
- Change wildcard: `<Navigate to="/dashboard" replace />`

### `packages/client/src/components/Auth/LoginPage.tsx`:

- Change all `navigate('/board/default')` → `navigate('/dashboard')`

**Validate**: Login → lands on `/dashboard`. Direct `/board/:id` URLs still work.

---

## Step 7 — Board header with back navigation

**Modify**: `packages/client/src/components/Board/BoardPage.tsx`

Add a thin top bar (40–48px) above the existing canvas:

```
┌──────────────────────────────────────────┐
│  ← Dashboard    Board Title    [users]   │
├──────────────────────────────────────────┤
│                                          │
│            (existing canvas)             │
│                                          │
└──────────────────────────────────────────┘
```

- "← Dashboard" link → `navigate('/dashboard')`
- Board title: fetch via `getBoard(boardId)` on mount. Show "Untitled Board" as fallback.
  If the board doesn't exist in the `boards` table yet (e.g. old `/board/default` URL),
  show just the `boardId`.
- Inline-edit title if the current user is the owner (click title → input → blur/enter saves via `updateBoardTitle`)
- Presence dots / online user count can move into this bar or stay separate.

Adjust canvas container height to account for the header (`calc(100vh - 48px)` or similar).

**Validate**: Navigate to board from dashboard, see header, click back.

---

## What's intentionally deferred

- **Access control in Hocuspocus** — any authenticated user can still connect to any board by ID. This is fine: the URL is the share mechanism. Gating can be added later.
- **Board member lists / roles** — not needed yet. Presence panel shows who's online.
- **Board thumbnails / previews** — out of scope.
- **Invite-by-email sharing** — URL sharing is sufficient for now.
