# Board Thumbnail Preview — Implementation Plan

## Overview
Generate a small preview image of each board's content and display it on the Dashboard so users can visually identify their boards.

**Capture strategy**: Compute the bounding box of all objects on the board, center a virtual 1920×1080 viewport on that bounding box, render it, and scale down to a 480×270 JPEG thumbnail.

**Storage**: Binary BLOB in the existing SQLite `boards` table, served via a dedicated image endpoint (keeps the board-list API lightweight and lets browsers cache thumbnails).

**Trigger**: Debounced capture ~30 seconds after the last Yjs change, plus a best-effort capture on page leave via `navigator.sendBeacon`.

---

## Steps

### 1. Shared types (`packages/shared/src/types.ts`)
- Add `hasThumbnail: boolean` to `BoardMetadata` so the Dashboard knows which boards have a preview image.

### 2. Database layer (`packages/server/src/hocuspocus/database.ts`)
- **Schema migration**: `ALTER TABLE boards ADD COLUMN thumbnail BLOB` (run at startup, idempotent via `IF NOT EXISTS`-style try/catch since SQLite doesn't support `ADD COLUMN IF NOT EXISTS`).
- **`updateBoardThumbnail(db, boardId, buffer: Buffer)`** — `UPDATE boards SET thumbnail = ? WHERE id = ?`.
- **`getBoardThumbnail(db, boardId)`** — `SELECT thumbnail FROM boards WHERE id = ?`, returns `Buffer | null`.
- **Update `listBoardsByOwner`** query to include `(thumbnail IS NOT NULL) AS has_thumbnail` and map it to the `hasThumbnail` field.
- **Update `getBoard`** similarly.

### 3. API routes (`packages/server/src/routes/boards.ts`)
- **`PUT /api/boards/:id/thumbnail`**
  - Auth-guarded (existing `authMiddleware`).
  - Accepts raw binary body (`Content-Type: image/jpeg` or `image/png`).
  - Use `express.raw({ type: ['image/jpeg', 'image/png'], limit: '512kb' })` middleware on just this route.
  - Validates ownership (only the board owner can update the thumbnail).
  - Calls `updateBoardThumbnail()`.
  - Returns `204 No Content`.
- **`GET /api/boards/:id/thumbnail`**
  - Auth-guarded.
  - Calls `getBoardThumbnail()`.
  - Returns the image buffer with `Content-Type: image/jpeg` and `Cache-Control: max-age=300`.
  - Returns `404` if no thumbnail exists.

### 4. Client API helpers (`packages/client/src/lib/api.ts`)
- **`uploadThumbnail(boardId: string, blob: Blob): Promise<void>`** — `PUT` with the blob as body and correct `Content-Type`.
- **`getThumbnailUrl(boardId: string): string`** — returns the full URL for the thumbnail endpoint (used as `<img src>`). Append the auth token as a query param (or use a cookie) since `<img>` tags can't set `Authorization` headers. Alternatively, fetch the image via JS and create an object URL.

### 5. Thumbnail capture hook (`packages/client/src/hooks/useThumbnailCapture.ts`)
- **`useThumbnailCapture(canvas, boardId, objectsMap)`**
- Listens to the Yjs `objectsMap` `observe` event for changes.
- On change, starts/resets a 30-second debounce timer.
- When the timer fires:
  1. Compute the bounding box of all objects on the canvas (iterate `canvas.getObjects()`, compute union of bounding rects).
  2. If no objects, skip capture.
  3. Temporarily set the viewport to center on the bounding box with padding, fitting within a 1920×1080 virtual viewport.
  4. Call `canvas.toDataURL({ format: 'jpeg', quality: 0.7, multiplier: 480 / 1920 })` to produce a 480×270 thumbnail.
  5. Restore the original viewport transform.
  6. Convert the data URL to a `Blob` and call `uploadThumbnail()`.
- On component unmount (useEffect cleanup), do a best-effort capture using `navigator.sendBeacon()` with the thumbnail blob.
- Guard against double-captures and skip if no changes occurred since the last capture.

### 6. Wire up capture in `BoardPage.tsx`
- Import and call `useThumbnailCapture(fabricRef.current, boardId, objectsMap)` alongside existing hooks.
- Only activate once the canvas and Yjs provider are both ready.

### 7. Dashboard display (`packages/client/src/components/Dashboard/Dashboard.tsx`)
- For each board card, if `board.hasThumbnail` is true:
  - Fetch the thumbnail image via `getThumbnailUrl(board.id)` (use a small hook or inline `useEffect` + object URL to handle auth).
  - Display as `<img>` with `object-fit: cover` inside the card, above the title.
- If no thumbnail: show a placeholder (e.g., a subtle gradient or icon representing an empty board).
- Thumbnail area is fixed-height (e.g., 135px for a 480×270 image at 50% display scale), 100% width of the card.

---

## Files modified
| File | Change |
|------|--------|
| `packages/shared/src/types.ts` | Add `hasThumbnail` to `BoardMetadata` |
| `packages/server/src/hocuspocus/database.ts` | Add thumbnail column migration, CRUD functions, update queries |
| `packages/server/src/routes/boards.ts` | Add PUT/GET thumbnail endpoints |
| `packages/client/src/lib/api.ts` | Add `uploadThumbnail`, `getThumbnailUrl` |
| `packages/client/src/components/Board/BoardPage.tsx` | Wire up `useThumbnailCapture` |
| `packages/client/src/components/Dashboard/Dashboard.tsx` | Display thumbnails in board cards |

## Files created
| File | Purpose |
|------|---------|
| `packages/client/src/hooks/useThumbnailCapture.ts` | Debounced thumbnail capture + upload hook |
