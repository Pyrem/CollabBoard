# Throttling & Batch Operations Plan

Modeled after CollabCanvas's approach, adapted for our Fabric.js + Yjs stack.

---

## 1. Consolidate throttle constants (`packages/shared/src/constants.ts`)

Replace the scattered throttle values with a structured `THROTTLE` object and a combined adaptive function.

**Before:**
```ts
export const CURSOR_THROTTLE_MS = 30;
export const OBJECT_SYNC_THROTTLE_MS = 50;
export function getObjectSyncThrottle(userCount: number): number { ... }
```

**After:**
```ts
export const THROTTLE = {
  CURSOR_MS: 30,          // normal cursor broadcast
  CURSOR_HEAVY_MS: 100,   // cursor during heavy operations (group drag)
  BASE_MS: 50,            // single-object sync minimum
  PER_SHAPE_MS: 2,        // added per selected shape
  MAX_MS: 500,            // absolute cap
  COLOR_CHANGE_MS: 100,   // color picker debounce
} as const;

export function getAdaptiveThrottleMs(
  userCount: number,
  selectionSize: number,
): number {
  // User-count base: 50 / 100 / 200
  let base: number;
  if (userCount <= 5) base = 50;
  else if (userCount <= 10) base = 100;
  else base = 200;
  // Selection-size overhead
  return Math.min(base + THROTTLE.PER_SHAPE_MS * selectionSize, THROTTLE.MAX_MS);
}
```

Keep the old exports as deprecated aliases so nothing breaks mid-change:
```ts
/** @deprecated Use THROTTLE.CURSOR_MS */
export const CURSOR_THROTTLE_MS = THROTTLE.CURSOR_MS;
/** @deprecated Use getAdaptiveThrottleMs */
export const OBJECT_SYNC_THROTTLE_MS = THROTTLE.BASE_MS;
/** @deprecated Use getAdaptiveThrottleMs */
export const getObjectSyncThrottle = (u: number) => getAdaptiveThrottleMs(u, 1);
```

---

## 2. Switch to `performance.now()` everywhere

`Date.now()` is wall-clock and can jump on NTP sync or sleep/wake. `performance.now()` is monotonic and sub-ms precise.

**Files affected:**
- `packages/client/src/hooks/useCursors.ts` — `lastUpdateRef`
- `packages/client/src/components/Board/canvas/localModifications.ts` — `lastObjectSyncRef`

Mechanical find-and-replace of `Date.now()` → `performance.now()` in throttle checks only (NOT in `lastModifiedAt` timestamps, which must remain wall-clock).

---

## 3. Add batch operations to `useBoard` (`packages/client/src/hooks/useBoard.ts`)

Add three new methods wrapping mutations in `doc.transact()`:

```ts
batchUpdateObjects(updates: Array<{ id: string; updates: Partial<BoardObject> }>): void
batchDeleteObjects(ids: string[]): void
batchCreateObjects(objects: BoardObject[]): void
```

Each wraps the loop in `objectsMap.doc?.transact(() => { ... })`. This collapses N Yjs mutations into a single WebSocket message. The `clearAll` method already does this — we're generalizing the pattern.

**Impact:** Group move of 20 objects sends 1 message instead of 20.

Update the `UseBoardReturn` interface to include these.

---

## 4. Handle ActiveSelection in `localModifications.ts`

Currently, when Fabric fires `object:modified` on an `ActiveSelection` (multi-select), the code tries to read a single `boardId` and falls through. We need to decompose the group transform and batch-update all objects.

**Changes to `attachLocalModifications`:**

Add a new `boardRef` parameter for `batchUpdateObjects` (available after step 3). Add a new parameter `selectionSizeRef` to enable adaptive throttling by selection count.

In each handler (`object:moving`, `object:scaling`, `object:rotating`, `object:modified`), add an `ActiveSelection` branch:

```ts
import { ActiveSelection } from 'fabric';

// In object:modified handler:
if (obj instanceof ActiveSelection) {
  const objects = obj.getObjects();
  const updates = objects.map((child) => {
    const childId = getBoardId(child);
    if (!childId) return null;
    // Decompose: get the child's absolute transform from the group
    const transform = child.calcTransformMatrix();
    const decomposed = util.qrDecompose(transform);
    return {
      id: childId,
      updates: {
        x: decomposed.translateX,
        y: decomposed.translateY,
        rotation: decomposed.angle,
        width: (child.width ?? 0) * decomposed.scaleX,
        height: (child.height ?? 0) * decomposed.scaleY,
      },
    };
  }).filter(Boolean);

  isLocalUpdateRef.current = true;
  for (const u of updates) localUpdateIdsRef.current.add(u.id);
  boardRef.current.batchUpdateObjects(updates);  // single Yjs transaction
  isLocalUpdateRef.current = false;

  // Reset scale on each child
  for (const child of objects) {
    child.set({ scaleX: 1, scaleY: 1 });
    child.setCoords();
  }
  return;
}
```

For the throttled intermediate events (`object:moving`, `object:scaling`, `object:rotating`), we use the adaptive throttle with selection size:

```ts
const selectionSize = (obj instanceof ActiveSelection)
  ? obj.getObjects().length
  : 1;
const throttleMs = getAdaptiveThrottleMs(userCountRef.current, selectionSize);
```

During intermediate group drags, we only broadcast the **bounding box position** (one update for the first object as a preview), then commit all objects on `object:modified`. This matches CollabCanvas's approach of only broadcasting one shape's intermediate state.

---

## 5. Handle multi-delete in `selectionManager.ts`

Currently delete only handles a single active object. Add ActiveSelection support:

```ts
import { ActiveSelection } from 'fabric';

// In handleKeyDown:
if (active instanceof ActiveSelection) {
  const ids = active.getObjects()
    .map(getBoardId)
    .filter((id): id is string => id !== null);
  canvas.discardActiveObject();
  boardRef.current.batchDeleteObjects(ids);  // single Yjs transaction
  onSelectionChangeRef.current(null);
  return;
}
```

---

## 6. Two-tier cursor throttle (`packages/client/src/hooks/useCursors.ts`)

Add a `forceThrottle` parameter to `updateLocalCursor` for heavier throttling during group operations:

```ts
updateLocalCursor: (position: CursorPosition, heavy?: boolean) => void;

// Inside:
const interval = heavy ? THROTTLE.CURSOR_HEAVY_MS : THROTTLE.CURSOR_MS;
if (now - lastUpdateRef.current < interval) return;
```

Callers pass `heavy: true` when broadcasting cursor during a multi-object drag (called from `localModifications.ts` or `panZoom.ts` during interaction).

---

## 7. Color change throttle (`packages/client/src/components/Toolbar/Toolbar.tsx`)

Add a `lastColorChangeRef` to prevent flooding Yjs when clicking rapidly through colors:

```ts
const lastColorChangeRef = useRef(0);

const handleColorChange = (color: string) => {
  const now = performance.now();
  if (now - lastColorChangeRef.current < THROTTLE.COLOR_CHANGE_MS) return;
  lastColorChangeRef.current = now;
  // ... existing color change logic
};
```

---

## Summary of files changed

| File | Change |
|------|--------|
| `packages/shared/src/constants.ts` | Consolidated `THROTTLE` object, `getAdaptiveThrottleMs()`, deprecated aliases |
| `packages/client/src/hooks/useBoard.ts` | Add `batchUpdateObjects`, `batchDeleteObjects`, `batchCreateObjects` |
| `packages/client/src/hooks/useCursors.ts` | `performance.now()`, two-tier throttle via `heavy` param |
| `packages/client/src/components/Board/canvas/localModifications.ts` | `performance.now()`, ActiveSelection decomposition + batch updates, selection-aware adaptive throttle |
| `packages/client/src/components/Board/canvas/selectionManager.ts` | ActiveSelection multi-delete via `batchDeleteObjects` |
| `packages/client/src/components/Toolbar/Toolbar.tsx` | Color change throttle |
| `packages/client/src/components/Board/Canvas.tsx` | Wire the new batch methods through to the submodules |
