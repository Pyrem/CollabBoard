# CollabBoard — Feature Stories

Reference file for planned work. Each story has acceptance criteria, affected files,
and notes on how it connects to the rest of the codebase.

Current state (as of 2026-02-20):
- Canvas.tsx is a ~230-line orchestrator. All behavior is delegated to submodules:
  - `canvas/fabricHelpers.ts`: pure Fabric object create/update functions
  - `canvas/panZoom.ts`: pan (alt/middle-click) and zoom (scroll wheel) listeners
  - `canvas/selectionManager.ts`: selection tracking and keyboard delete
  - `canvas/localModifications.ts`: object:moving/scaling/modified -> Yjs
  - `canvas/useObjectSync.ts`: Yjs observer + initial load -> Fabric
  - `canvas/TextEditingOverlay.tsx`: sticky note textarea overlay
- Implemented object types: sticky notes, rectangles.
- Types defined but NOT implemented: circle, line, connector, frame, text.
- `rotation` field exists in `BaseBoardObject` but is hard-disabled in Fabric
  (`lockRotation: true`, `setControlVisible('mtr', false)`).

---

## Story 1: Extract Canvas.tsx into submodules (Part 1 — helpers and event modules)

**Goal:** Break the mount `useEffect` into focused, testable modules without
changing any user-visible behavior.

### What to extract

| New file | What moves into it |
|----------|--------------------|
| `canvas/fabricHelpers.ts` | `getBoardId`, `setBoardId`, `getStickyContent`, `setStickyContent`, `createStickyGroup`, plus new `createRectFromData` / `updateRectFromData` |
| `canvas/panZoom.ts` | `attachPanZoom()` — all pan (alt/middle-click drag) and zoom (scroll wheel) listeners, `emitViewport` helper |
| `canvas/selectionManager.ts` | `attachSelectionManager()` — `selection:created/updated/cleared` handlers, keyboard delete handler |
| `canvas/localModifications.ts` | `attachLocalModifications()` — `object:moving`, `object:scaling`, `object:modified` handlers, throttle logic |
| `canvas/TextEditingOverlay.tsx` | Presentational component for the sticky-note textarea overlay (JSX + styles only) |

Each `attach*()` function receives the Fabric canvas + any needed refs, registers
event listeners, and returns a cleanup function. Canvas.tsx calls them all in its
mount effect and collects the cleanups.

### Acceptance criteria

- [ ] Canvas.tsx shrinks to <150 lines (orchestrator + refs + state + JSX)
- [ ] Each extracted module has a single responsibility
- [ ] All `attach*` functions return `() => void` cleanup functions
- [ ] `fabricHelpers.ts` exports pure functions — no side effects, no refs
- [ ] No user-visible behavior changes (pan, zoom, create, move, resize, delete,
      text editing, selection, multiplayer sync all work identically)
- [ ] Existing tests still pass (`pnpm test`)

### Files affected

- `packages/client/src/components/Board/Canvas.tsx` (gutted to orchestrator)
- `packages/client/src/components/Board/canvas/fabricHelpers.ts` (new)
- `packages/client/src/components/Board/canvas/panZoom.ts` (new)
- `packages/client/src/components/Board/canvas/selectionManager.ts` (new)
- `packages/client/src/components/Board/canvas/localModifications.ts` (new)
- `packages/client/src/components/Board/canvas/TextEditingOverlay.tsx` (new)

### Notes

- Refs like `boardRef`, `isRemoteUpdateRef`, `editingStickyRef` stay in Canvas.tsx
  and are passed by reference to the attach functions. This avoids stale closures
  without triggering effect re-runs.
- The double-click-to-edit handler stays in Canvas.tsx because it sets React state
  (`setEditingSticky`). It calls helpers from `fabricHelpers.ts`.

---

## Story 2: Extract Canvas.tsx into submodules (Part 2 — Yjs object sync hook)

**Goal:** Move the second `useEffect` (Yjs observer + initial load + `syncObjectToCanvas` /
`removeObjectFromCanvas`) into a dedicated `useObjectSync` hook.

### What to extract

| New file | What moves into it |
|----------|--------------------|
| `canvas/useObjectSync.ts` | `syncObjectToCanvas`, `removeObjectFromCanvas`, initial load logic, Yjs `observe`/`unobserve` lifecycle |

This is the one piece that works as a real React hook (not an attach function)
because it depends on `objectsMap`, which is a prop that changes when the user
switches boards.

### Acceptance criteria

- [x] `useObjectSync` is a proper React hook with `objectsMap` in its dependency array
- [x] Uses helpers from `fabricHelpers.ts` (Story 1) for creating/updating Fabric objects
- [x] Adding a new object type requires only: (a) a create/update function in
      `fabricHelpers.ts`, (b) a new `case` in the sync switch inside `useObjectSync.ts`
- [x] Canvas.tsx is now purely an orchestrator — no business logic remains
- [ ] Multiplayer sync still works: changes from other users appear in real time
- [x] No regressions (`pnpm test`)

### Files affected

- `packages/client/src/components/Board/Canvas.tsx` (remove sync effect)
- `packages/client/src/components/Board/canvas/useObjectSync.ts` (new)
- `packages/client/src/components/Board/canvas/fabricHelpers.ts` (may gain new helpers)

### Notes

- The sync switch currently handles `'sticky'` and `'rectangle'`. After this story
  it becomes the single extension point for new object types.
- `findByBoardId` moves into `fabricHelpers.ts` since `useObjectSync` and
  `selectionManager` both need it.

---

## Story 3: Connectors — lines/arrows between objects

**Goal:** Users can draw lines or arrows that connect two objects. When either
connected object moves, the connector endpoint follows.

### Types (already defined in `shared/types.ts`)

```
Connector { type: 'connector', fromId, toId, stroke, style: 'straight' | 'curved' }
```

### Implementation plan

1. **fabricHelpers.ts** — `createConnectorFromData()`: creates a Fabric `Line` (or
   `Path` for curved) between the center points of `fromId` and `toId` objects.
   `updateConnectorFromData()`: repositions endpoints.
2. **useObjectSync.ts** — `case 'connector':` in the sync switch.
3. **localModifications.ts** — when any object moves, find all connectors where
   `fromId` or `toId` matches and update their endpoints in Yjs.
4. **Toolbar** — add a "connector" tool. UX: click first object, click second
   object, connector is created between them.
5. **useBoard.ts** — `createConnector(fromId, toId, style, stroke)` method.

### Acceptance criteria

- [ ] Can create a connector between two existing objects via toolbar
- [ ] Connector renders as a line between the center points of both objects
- [ ] Moving either connected object updates the connector in real time
- [ ] Connectors sync across multiple users
- [ ] Deleting a connected object removes the connector (or leaves it dangling
      with a visual indicator — decide during implementation)
- [ ] Supports both 'straight' and 'curved' styles
- [ ] At least basic arrowhead rendering on the `toId` end

### Files affected

- `packages/shared/src/types.ts` (already has type — no changes needed)
- `packages/client/src/components/Board/canvas/fabricHelpers.ts`
- `packages/client/src/components/Board/canvas/useObjectSync.ts`
- `packages/client/src/components/Board/canvas/localModifications.ts`
- `packages/client/src/components/Toolbar/Toolbar.tsx`
- `packages/client/src/hooks/useBoard.ts`

### Depends on

- Stories 1 & 2 (extraction must be done first — connector endpoint tracking
  goes in `localModifications.ts`)

---

## Story 4: Text — standalone text elements

**Goal:** Users can place standalone text on the canvas (not inside a sticky note).
Text is directly editable with double-click.

### Types (already defined in `shared/types.ts`)

```
TextElement { type: 'text', text, fontSize, fill }
```

### Implementation plan

1. **fabricHelpers.ts** — `createTextFromData()`: creates a Fabric `Textbox` or
   `IText`. `updateTextFromData()`: updates position, text content, font size, fill.
2. **useObjectSync.ts** — `case 'text':` in the sync switch.
3. **localModifications.ts** — handle `object:modified` for text objects (position,
   size after resize). May also need `text:changed` Fabric event for inline edits.
4. **TextEditingOverlay or Fabric IText** — decide approach: reuse the HTML
   textarea overlay (like sticky notes) or use Fabric's built-in `IText` editing.
   Fabric `IText` is simpler since it handles editing natively, but the textarea
   overlay gives more control over styling. Recommend Fabric `IText` for standalone
   text to differentiate from sticky note editing.
5. **Toolbar** — add a "text" tool. Click canvas to place a text element.
6. **useBoard.ts** — `createText(text, x, y, fontSize, fill)` method.

### Acceptance criteria

- [ ] Can create a text element by selecting the text tool and clicking the canvas
- [ ] Text is editable by double-clicking (either via IText or textarea overlay)
- [ ] Text syncs across multiple users (content + position + style)
- [ ] Can change font size and fill color
- [ ] Text elements can be moved and resized
- [ ] Text content changes from other users appear in real time

### Files affected

- `packages/shared/src/types.ts` (already has type — no changes needed)
- `packages/client/src/components/Board/canvas/fabricHelpers.ts`
- `packages/client/src/components/Board/canvas/useObjectSync.ts`
- `packages/client/src/components/Board/canvas/localModifications.ts`
- `packages/client/src/components/Toolbar/Toolbar.tsx`
- `packages/client/src/hooks/useBoard.ts`

### Depends on

- Stories 1 & 2

---

## Story 5: Frames — group and organize content areas

**Goal:** Users can create titled rectangular areas that visually group other
objects. Frames render behind other content and display a title label.

### Types (already defined in `shared/types.ts`)

```
Frame { type: 'frame', title, fill }
```

### Current state

- Type is defined. No rendering, creation, or toolbar code exists.
- No "contains" logic (detecting which objects are inside a frame).

### Implementation plan

1. **fabricHelpers.ts** — `createFrameFromData()`: creates a Fabric `Rect` with a
   semi-transparent fill, a border, and a `Textbox` title label positioned above
   the top edge. Wrap in a `Group`. `updateFrameFromData()`: updates position,
   size, title, fill.
2. **useObjectSync.ts** — `case 'frame':` in the sync switch. Frames must be
   added at low zIndex so they render behind other objects.
3. **Z-index management** — frames always render behind non-frame objects.
   On initial load and on add, sort so frames come first.
4. **Toolbar** — add a "frame" tool. Click-drag to define the frame area, then
   type a title.
5. **useBoard.ts** — `createFrame(title, x, y, width, height, fill)` method.
6. **(Stretch) Contains logic** — when a frame moves, objects visually inside it
   move with it. This is complex and can be deferred to a follow-up.

### Acceptance criteria

- [ ] Can create a frame via toolbar (click-drag to define area)
- [ ] Frame renders with a semi-transparent fill and visible border
- [ ] Frame has an editable title label above its top edge
- [ ] Frames always render behind other objects (z-index management)
- [ ] Frames can be moved and resized
- [ ] Frames sync across multiple users
- [ ] (Stretch) Moving a frame moves all objects contained within it

### Files affected

- `packages/shared/src/types.ts` (already has type — no changes needed)
- `packages/client/src/components/Board/canvas/fabricHelpers.ts`
- `packages/client/src/components/Board/canvas/useObjectSync.ts`
- `packages/client/src/components/Toolbar/Toolbar.tsx`
- `packages/client/src/hooks/useBoard.ts`

### Depends on

- Stories 1 & 2

---

## Story 6: Transforms — rotation support

**Goal:** Users can rotate any object (rectangles, text, frames) using Fabric's
built-in rotation control handle.

### Current state

- `BaseBoardObject.rotation` field exists and is persisted to Yjs (always as `0`).
- Fabric explicitly disables rotation on all objects:
  - Sticky notes: `lockRotation: true` on the Group
  - Rectangles: `lockRotation: true`, `setControlVisible('mtr', false)`
- `useBoard.test.ts` already has a passing test for `rotation: 45` updates.

### Implementation plan

1. **fabricHelpers.ts** — remove `lockRotation: true` and
   `setControlVisible('mtr', false)` from rectangle creation. Keep sticky notes
   locked (rotating a text-filled sticky is odd UX). Enable rotation for text
   elements and frames when those are implemented.
2. **localModifications.ts** — in `object:modified`, read `obj.angle` and write
   it to Yjs as `rotation`.
3. **useObjectSync.ts** — when updating existing objects, apply
   `existing.set('angle', data.rotation)`.
4. **fabricHelpers.ts create functions** — set `angle: data.rotation` on creation
   so rotated objects from other users render correctly.

### Acceptance criteria

- [x] Rectangles show a rotation handle and can be rotated by dragging it
- [x] Rotation value persists to Yjs and syncs across users
- [x] Rotated objects render at the correct angle on initial load
- [ ] Text elements and frames (once implemented) also support rotation
- [x] Sticky notes support rotation (mtr handle only, resize stays locked)
- [x] No regressions to move/resize behavior

### Files affected

- `packages/client/src/components/Board/canvas/fabricHelpers.ts`
- `packages/client/src/components/Board/canvas/localModifications.ts`
- `packages/client/src/components/Board/canvas/useObjectSync.ts`

### Depends on

- Stories 1 & 2 (the rotation logic touches all three extracted modules)

### Notes

- This is the smallest story. It's mostly removing code (the lock flags) and
  adding `angle` read/write in two places.

---

## Story 7: Operations — duplicate, copy/paste

**Goal:** Users can duplicate selected objects, and copy/paste objects using
standard keyboard shortcuts.

### Implementation plan

1. **canvas/clipboard.ts** — `attachClipboard()` function that registers
   `keydown` listeners for Ctrl/Cmd+C, Ctrl/Cmd+V, Ctrl/Cmd+D (duplicate).
2. **Copy** — read the selected Fabric object(s), look up their BoardObject data
   from Yjs via `boardRef.current.getObject(id)`, store in a module-level
   clipboard array.
3. **Paste** — for each object in the clipboard, create a new object with a new
   UUID, offset by (+20, +20) from the original position. Use the appropriate
   `board.create*` method based on type.
4. **Duplicate** (Ctrl/Cmd+D) — copy + paste in one step, no clipboard storage.
5. **useBoard.ts** — add a `duplicateObject(id, offsetX, offsetY)` convenience
   method, or reuse existing create methods with copied properties.
6. **Canvas.tsx** — add `attachClipboard(canvas, boardRef)` to the mount effect.

### Acceptance criteria

- [ ] Ctrl/Cmd+C copies the selected object(s) to an internal clipboard
- [ ] Ctrl/Cmd+V pastes copied objects at a (+20, +20) offset from original
- [ ] Ctrl/Cmd+D duplicates the selected object in one action
- [ ] Pasted/duplicated objects are fully independent (new IDs, synced via Yjs)
- [ ] Works for all object types (sticky, rectangle, text, frame, connector)
- [ ] Does not interfere with text editing (no copy/paste while editing sticky
      note text or a Fabric IText)
- [ ] Pasted objects are selected after paste (for easy repositioning)

### Files affected

- `packages/client/src/components/Board/canvas/clipboard.ts` (new)
- `packages/client/src/components/Board/Canvas.tsx` (add cleanup call)
- `packages/client/src/hooks/useBoard.ts` (optional `duplicateObject` method)

### Depends on

- Stories 1 & 2 (clipboard follows the `attach*` pattern)
- Best implemented after Stories 3-5 so all object types can be duplicated

---

## Dependency graph

```
Story 1 (Extract: helpers + events)
  └─► Story 2 (Extract: Yjs sync hook)
        ├─► Story 3 (Connectors)
        ├─► Story 4 (Text)
        ├─► Story 5 (Frames)
        ├─► Story 6 (Rotation)
        └─► Story 7 (Copy/Paste)
```

Stories 3-6 are independent of each other and can be done in any order.
Story 7 benefits from all object types being implemented first.

## Recommended order

1. Story 1 → Story 2 (extraction — prerequisite for everything)
2. Story 6 (Rotation — smallest, validates the extraction worked)
3. Story 4 (Text — second simplest new type)
4. Story 5 (Frames — moderate complexity, z-index management)
5. Story 3 (Connectors — most complex, needs endpoint tracking)
6. Story 7 (Copy/Paste — best done last, covers all types)

---
---

# Throttling & Batch Operations — Implementation Stories

Tracks the incremental implementation of the plan described in `PLAN.md`.
Each story is independently testable. Stories should be completed and verified
before moving to the next (unless explicitly marked as independent).

---

## TB Dependency Graph

```
TB-Story 1 (throttle config + perf.now + logger)
  ├─→ TB-Story 2 (batch ops in useBoard)
  │     ├─→ TB-Story 3 (multi-delete)
  │     └─→ TB-Story 4 (ActiveSelection decomposition)
  │           └─→ TB-Story 5 (adaptive throttle for group events)
  ├─→ TB-Story 6 (two-tier cursor throttle)  [independent of 2–5]
  └─→ TB-Story 7 (color change throttle)     [independent of 2–6]
```

---

## TB-Story 1: Consolidate throttle config + `performance.now()` + logger

**Goal:** Single source of truth for all throttle constants, monotonic clock for
throttle checks, and a lightweight structured logger for tracing activity.

### Tasks

1. **`packages/shared/src/constants.ts`**
   - Add `THROTTLE` object with `CURSOR_MS`, `CURSOR_HEAVY_MS`, `BASE_MS`,
     `PER_SHAPE_MS`, `MAX_MS`, `COLOR_CHANGE_MS`.
   - Add `getAdaptiveThrottleMs(userCount, selectionSize)`.
   - Keep `CURSOR_THROTTLE_MS`, `OBJECT_SYNC_THROTTLE_MS`, `getObjectSyncThrottle`
     as deprecated aliases pointing at the new values.

2. **`packages/shared/src/logger.ts`** (new file)
   - Namespace-based structured logger (`throttle`, `batch`, `sync`, `cursor`,
     `selection`).
   - Levels: `debug`, `info`, `warn`, `error`.
   - `debug` gated by `localStorage` (client) or `COLLABBOARD_DEBUG` env var
     (server/Node).
   - Re-export from `packages/shared/src/index.ts`.

3. **`packages/client/src/hooks/useCursors.ts`**
   - Replace `Date.now()` with `performance.now()` in throttle check.

4. **`packages/client/src/components/Board/canvas/localModifications.ts`**
   - Replace `Date.now()` with `performance.now()` in all three throttle checks
     (moving, scaling, rotating).

### Checkpoint

- `pnpm build` passes with no errors.
- Existing single-object drag/rotate/scale works identically in the browser.
- Open two browser windows — sync latency unchanged.
- Setting `localStorage.setItem('collabboard:debug', 'true')` in devtools
  causes throttle-related debug logs to appear in the console.

### Files changed

| File | Change |
|------|--------|
| `packages/shared/src/constants.ts` | `THROTTLE` object, `getAdaptiveThrottleMs`, deprecated aliases |
| `packages/shared/src/logger.ts` | New file — structured logger |
| `packages/shared/src/index.ts` | Re-export logger |
| `packages/client/src/hooks/useCursors.ts` | `performance.now()` swap |
| `packages/client/src/components/Board/canvas/localModifications.ts` | `performance.now()` swap |

---

## TB-Story 2: Batch operations in `useBoard`

**Goal:** `batchUpdateObjects`, `batchDeleteObjects`, `batchCreateObjects` —
all wrapping `doc.transact()` to collapse N mutations into one sync message.

### Tasks

1. Add `batchUpdateObjects(updates: Array<{ id: string; updates: Partial<BoardObject> }>)` to `useBoard`.
2. Add `batchDeleteObjects(ids: string[])` to `useBoard`.
3. Add `batchCreateObjects(objects: BoardObject[])` to `useBoard`.
4. Update `UseBoardReturn` interface.
5. Add tests in `useBoard.test.ts` — verify that calling `batchUpdateObjects`
   with 5 updates fires only **one** Yjs update event.

### Checkpoint

- Unit tests pass: `pnpm --filter @collabboard/client test`.
- Existing single-object CRUD still works in the browser.
- Log output shows batch operation counts when debug logging is enabled.

### Files changed

| File | Change |
|------|--------|
| `packages/client/src/hooks/useBoard.ts` | Three new batch methods |
| `packages/client/src/hooks/useBoard.test.ts` | Tests for batch operations |

---

## TB-Story 3: Multi-delete via ActiveSelection

**Goal:** Shift-click multiple objects, press Delete — all removed in one sync event.

### Tasks

1. In `selectionManager.ts`, detect `ActiveSelection` on Delete/Backspace.
2. Collect all `boardId`s from the selection's children.
3. Call `batchDeleteObjects(ids)`.
4. Discard active object and fire selection change callback.

### Checkpoint

- Shift-click two objects, press Delete. Both disappear.
- Second browser window confirms both vanish simultaneously (one sync event).
- Single-object delete still works as before.

### Files changed

| File | Change |
|------|--------|
| `packages/client/src/components/Board/canvas/selectionManager.ts` | ActiveSelection multi-delete |
| `packages/client/src/components/Board/Canvas.tsx` | Wire `batchDeleteObjects` to selectionManager if needed |

---

## TB-Story 4: ActiveSelection decomposition in `object:modified`

**Goal:** When multiple selected objects are moved/resized/rotated together,
decompose the group transform and batch-update all objects on mouse-up.

### Tasks

1. Import `ActiveSelection` and `util` from Fabric.
2. In `object:modified`, add an `ActiveSelection` branch.
3. Decompose each child's transform via `calcTransformMatrix()` + `util.qrDecompose()`.
4. Call `batchUpdateObjects` with all decomposed positions/sizes/rotations.
5. Reset scale on each child and call `setCoords()`.

### Checkpoint

- Select 3 objects, drag as group, release. Second browser shows all 3 at
  correct final positions.
- Select 2 objects, resize via handles, release. Dimensions correct on both browsers.
- Single-object modify still works.

### Files changed

| File | Change |
|------|--------|
| `packages/client/src/components/Board/canvas/localModifications.ts` | ActiveSelection decomposition in `object:modified` |
| `packages/client/src/components/Board/Canvas.tsx` | Pass `batchUpdateObjects` through if needed |

---

## TB-Story 5: Adaptive throttle for intermediate group events

**Goal:** During group drag, use `getAdaptiveThrottleMs(userCount, selectionSize)`
for intermediate broadcasts. Only preview-broadcast one object's position, not all N.

### Tasks

1. In `object:moving`, `object:scaling`, `object:rotating`, detect `ActiveSelection`.
2. Compute `selectionSize = obj.getObjects().length`.
3. Use `getAdaptiveThrottleMs(userCountRef.current, selectionSize)` instead of
   `getObjectSyncThrottle(userCountRef.current)`.
4. For group drags, only broadcast the lead object's position as a preview.

### Checkpoint

- Select 10+ objects, drag. FPS stays at 60. Console shows adaptive throttle
  values increasing with selection size (debug logs).
- Second browser sees movement preview during drag.
- On mouse-up, TB-Story 4's handler snaps everything to final positions.

### Files changed

| File | Change |
|------|--------|
| `packages/client/src/components/Board/canvas/localModifications.ts` | Selection-aware adaptive throttle in intermediate events |

---

## TB-Story 6: Two-tier cursor throttle

**Goal:** Reduce cursor broadcast rate during heavy operations (group drag).

### Tasks

1. Add `heavy?: boolean` parameter to `updateLocalCursor`.
2. Use `THROTTLE.CURSOR_HEAVY_MS` (100ms) when `heavy` is true, else `THROTTLE.CURSOR_MS` (30ms).
3. Update `UseCursorsReturn` interface.
4. Wire callers to pass `heavy: true` during group drag operations.

### Checkpoint

- Open WebSocket frame inspector. During single-object drag, cursor updates at
  ~30ms intervals. During group drag, cursor updates at ~100ms intervals.

### Files changed

| File | Change |
|------|--------|
| `packages/client/src/hooks/useCursors.ts` | `heavy` parameter, two-tier throttle |
| `packages/client/src/components/Board/canvas/panZoom.ts` | Pass `heavy` flag when appropriate |

---

## TB-Story 7: Color change throttle

**Goal:** Prevent rapid color picker clicks from flooding Yjs with updates.

### Tasks

1. Add `lastColorChangeRef` in Toolbar component.
2. Gate color change calls with `THROTTLE.COLOR_CHANGE_MS` (100ms) debounce.

### Checkpoint

- Rapidly click through 6 colors in <200ms. Only ~2 Yjs updates fire.
- Normal-speed color picking works without noticeable delay.

### Files changed

| File | Change |
|------|--------|
| `packages/client/src/components/Toolbar/Toolbar.tsx` | Color change throttle |

---

## Logging Strategy

### Design

A lightweight structured logger in `packages/shared/src/logger.ts`, shared by
client and server. Not a framework — a thin wrapper providing consistent
output without ad-hoc `console.log` calls scattered across the codebase.

### Namespaces

| Namespace | Purpose | Example output |
|-----------|---------|----------------|
| `throttle` | Throttle decisions (accepted/rejected) | `[throttle] object:moving id=abc skipped (12ms < 50ms)` |
| `batch` | Batch operation execution | `[batch] batchUpdateObjects: 5 objects in 1 transaction` |
| `sync` | Yjs sync events (observer fires) | `[sync] remote update: 3 objects changed` |
| `cursor` | Cursor broadcast/receive | `[cursor] broadcast position heavy=false interval=30ms` |
| `selection` | Selection changes, multi-select | `[selection] ActiveSelection: 4 objects` |

### Levels

| Level | When | Default state |
|-------|------|---------------|
| `debug` | Throttle skip/accept, individual sync events | **OFF** |
| `info` | Batch operations, connection events | ON |
| `warn` | Validation failures, unexpected states | ON |
| `error` | Unrecoverable errors | ON |

### Activation

- **Browser:** `localStorage.setItem('collabboard:debug', 'true')` then refresh.
  Or `localStorage.setItem('collabboard:debug', 'throttle,cursor')` for specific
  namespaces only.
- **Server (Node):** `COLLABBOARD_DEBUG=true` env var. Or `COLLABBOARD_DEBUG=throttle,cursor`.

### API

```typescript
import { logger } from '@collabboard/shared';

const log = logger('throttle');

log.debug('object:moving skipped', { id, elapsed, threshold });
log.info('adaptive throttle', { userCount, selectionSize, result });
log.warn('unknown object type', { type });
log.error('batch update failed', { error });
```

### Principles

- Zero dependencies — wraps `console.*`.
- Structured data passed as second argument (object), not stringified — browser
  devtools show it expandable.
- No performance cost when disabled — level check is a single boolean comparison.
- Server-compatible — detects `localStorage` vs `process.env` automatically.
