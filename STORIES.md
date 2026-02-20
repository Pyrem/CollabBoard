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
- [x] Sticky notes remain non-rotatable (locked)
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
