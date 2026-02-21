# Frames Implementation Research (Miro Reference)

Research conducted 2026-02-21 for CollabBoard frame feature (build priority step 11, post-MVP).

---

## Overview

Miro frames serve three roles simultaneously:

1. **Visual containers** — rectangular regions that visually delineate a section of the board
2. **Grouping mechanism** — parent-child relationships with objects inside them; moving a frame moves all children
3. **Presentation slides** — each frame becomes one slide in presentation mode

---

## Parent-Child Model

The core data model uses `parentId` / `childrenIds`:

- When an object is placed inside a frame, the object's `parentId` is set to the frame's ID, and the frame's `childrenIds` array gains that object's ID.
- **Child coordinates become relative to the frame's top-left corner**, not the board origin. Conversion back to board coordinates:
  ```
  boardX = (frame.x - frame.width / 2) + child.relativeX
  boardY = (frame.y - frame.height / 2) + child.relativeY
  ```
- Moving a frame automatically repositions all children (their relative positions don't change).
- Resizing a frame does **not** scale children. They keep their absolute size and relative position.
- Objects can still be independently selected and manipulated within a frame.

---

## Containment Detection

- An object must be "sufficiently inside" the frame to be claimed as a child.
- Visual feedback: frame edges **turn blue** when an object will be accepted.
- **Recommended heuristic**: center-point test — if the object's center falls within the frame's bounding box, it becomes a child. Simpler and more predictable than percentage-overlap.
- Objects already parented to another frame do **not** auto-reparent when a new frame is drawn around them. Must be manually moved out and back in.
- Certain object types (drawings, connection lines, tables) have non-standard containment behavior.

---

## Frame Nesting

**Not supported.** This is one of Miro's most-requested features but remains unimplemented.

- Frames cannot have a `parentId` pointing to another frame.
- Moving an outer frame leaves inner frames behind.
- Workaround: users group frames together manually, but this has side effects.

**Recommendation for CollabBoard**: skip frame nesting. Frames cannot be children of other frames.

---

## Z-Ordering / Layering

- Historically, frames are **always rendered behind all other board objects**. No z-index manipulation.
- Miro recently added a Layers feature, but the traditional expectation remains: frame = backdrop, always behind its children.

**Recommendation for CollabBoard**: enforce that frames always render at a lower z-index than their children. Simplest approach: give frames a dedicated lower z-index range.

---

## Presentation Mode

- Each frame = one slide in presentation mode.
- Frame order is set in a **Frames panel** (default: creation order, reorderable via drag-and-drop).
- Presenter notes can be attached to each frame.
- Interactive presentation: other participants see a modal to "join" the presentation and follow the presenter's view.
- PDF export: each frame becomes one page.
- Direct URLs can be generated for individual frames.

---

## Visual Styling

| Property | Customizable? | Default |
|----------|--------------|---------|
| Title text | Yes | "Frame N" |
| Title position | No | Always above top-left corner |
| Title background color | No | Transparent |
| Frame background color | Yes | White |
| Frame border color | No | Faint gray |
| Frame border thickness | No | Thin line + subtle drop shadow |
| Frame shadow | No | Subtle drop shadow (cannot toggle off) |

Preset sizes available: 16:9, A4, custom drag. Minimum size: 100x100px.

---

## Required Type Changes for CollabBoard

Current type:
```typescript
interface Frame extends BaseBoardObject {
  type: 'frame';
  title: string;
  fill: string;
}
```

Updated types needed:
```typescript
// Add to BaseBoardObject
interface BaseBoardObject {
  // ... existing fields ...
  parentId: string | null;  // null if top-level, frame ID if contained
}

// Updated Frame type
interface Frame extends BaseBoardObject {
  type: 'frame';
  title: string;
  fill: string;
  childrenIds: string[];
}
```

---

## Implementation Checklist

- [ ] Add `parentId` to `BaseBoardObject` and `childrenIds` to `Frame`
- [ ] Store child coordinates relative to frame's top-left when parented
- [ ] Recalculate coordinates on parent/unparent operations
- [ ] Center-point containment test on object drop
- [ ] Blue highlight feedback when dragging object into frame
- [ ] Moving frame moves all children (preserve relative positions)
- [ ] Resizing frame does NOT scale children
- [ ] Frames always render behind their children (z-index enforcement)
- [ ] Prevent frame-in-frame nesting
- [ ] Frame title rendered above top-left corner, editable on double-click
- [ ] Customizable background color, default white
- [ ] Subtle border + shadow styling
- [ ] Yjs sync: observe `childrenIds` changes and propagate to Fabric.js
- [ ] Prevent infinite loops in Yjs <-> Fabric binding when reparenting
- [ ] AI tools: `createFrame()`, update `getBoardState()` to include frame hierarchy

## Key Technical Risks

1. **Relative coordinate system + Yjs sync**: When an object is reparented, its coordinates must be recalculated atomically with the parentId change. Use `Y.Doc.transact()` to batch these updates.
2. **Fabric.js rendering**: Fabric has its own group concept, but it may not map cleanly to frame containment. Likely need to manage frame-child rendering manually rather than using Fabric groups.
3. **Drag-and-drop reparenting**: Detecting when a drag ends inside a frame (containment test) while also handling the coordinate transform — this must feel instant and smooth.
4. **Multi-user reparenting conflicts**: Two users could simultaneously move an object into different frames. Yjs CRDT will resolve the `parentId` conflict, but the coordinate values may be inconsistent. Need to handle this edge case.
