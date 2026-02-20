import {
  Canvas as FabricCanvas,
  Rect,
  Textbox,
  Group,
  type FabricObject,
} from 'fabric';
import type { StickyNote, RectangleShape } from '@collabboard/shared';
import { DEFAULT_FILL, DEFAULT_STROKE } from '@collabboard/shared';

/**
 * Read the board-object UUID stored on a Fabric object.
 *
 * Fabric has no first-class custom-data API, so the ID is stashed as a
 * dynamic `boardId` property via an `unknown` cast.
 */
export function getBoardId(obj: FabricObject): string | undefined {
  return (obj as unknown as { boardId?: string }).boardId;
}

/**
 * Attach a board-object UUID to a Fabric object so it can be looked up
 * later by {@link getBoardId}.
 */
export function setBoardId(obj: FabricObject, id: string): void {
  (obj as unknown as { boardId: string }).boardId = id;
}

/**
 * Cache a sticky note's text and color directly on the Fabric Group.
 *
 * Used by the sync layer to detect whether a remote update is
 * position-only (cheap move) vs. content-changed (requires Group recreation).
 */
export function setStickyContent(obj: FabricObject, text: string, color: string): void {
  const record = obj as unknown as { _stickyText: string; _stickyColor: string };
  record._stickyText = text;
  record._stickyColor = color;
}

/**
 * Retrieve the cached text/color from a Fabric Group set by {@link setStickyContent}.
 * @returns The cached values, or `undefined` if they were never set.
 */
export function getStickyContent(obj: FabricObject): { text: string; color: string } | undefined {
  const record = obj as unknown as { _stickyText?: string; _stickyColor?: string };
  if (record._stickyText !== undefined && record._stickyColor !== undefined) {
    return { text: record._stickyText, color: record._stickyColor };
  }
  return undefined;
}

/**
 * Build a Fabric.js `Group` representing a sticky note.
 *
 * The group contains a colored background `Rect` and a `Textbox` with 10 px
 * padding. Rotation and resize controls are disabled — sticky notes are
 * fixed-size and can only be dragged.
 *
 * @param stickyData - Validated {@link StickyNote} from the Yjs map.
 * @returns A new `Group` positioned at `(stickyData.x, stickyData.y)`.
 *   Caller must call {@link setBoardId} and {@link setStickyContent} on it.
 */
export function createStickyGroup(stickyData: StickyNote): Group {
  const bg = new Rect({
    width: stickyData.width,
    height: stickyData.height,
    fill: stickyData.color,
    rx: 4,
    ry: 4,
    stroke: null,
    strokeWidth: 0,
  });

  const text = new Textbox(stickyData.text || 'Type here...', {
    fontSize: 16,
    fill: '#333',
    width: stickyData.width - 20,
    textAlign: 'left',
    splitByGrapheme: true,
    stroke: null,
    strokeWidth: 0,
  });

  const group = new Group([bg, text], {
    left: stickyData.x,
    top: stickyData.y,
    subTargetCheck: false,
    interactive: false,
    lockRotation: true,
    lockScalingX: true,
    lockScalingY: true,
    hasControls: false,
  });

  const halfW = group.width / 2;
  const halfH = group.height / 2;
  bg.set({ left: -halfW, top: -halfH, width: group.width, height: group.height });
  text.set({ left: -halfW + 10, top: -halfH + 10, width: group.width - 20 });
  group.dirty = true;

  return group;
}

/**
 * Create a Fabric `Rect` from a validated {@link RectangleShape}.
 *
 * Rotation is disabled (Story 6 will unlock it). The board ID is set
 * automatically via {@link setBoardId} — no caller action needed.
 *
 * @param rectData - Validated rectangle from the Yjs map.
 * @returns A positioned `Rect` ready to be added to the canvas.
 */
export function createRectFromData(rectData: RectangleShape): Rect {
  const rect = new Rect({
    left: rectData.x,
    top: rectData.y,
    width: rectData.width,
    height: rectData.height,
    strokeWidth: 2,
    lockRotation: true,
  });
  rect.set('fill', rectData.fill || DEFAULT_FILL);
  rect.set('stroke', rectData.stroke || DEFAULT_STROKE);
  rect.dirty = true;
  rect.setControlVisible('mtr', false);
  setBoardId(rect, rectData.id);
  return rect;
}

/**
 * Apply position/size/style changes to an existing Fabric `Rect` in-place.
 *
 * Resets `scaleX`/`scaleY` to 1 and writes actual dimensions so Fabric's
 * coordinate cache stays consistent after remote updates.
 */
export function updateRectFromData(existing: Rect, rectData: RectangleShape): void {
  existing.set({
    left: rectData.x,
    top: rectData.y,
    width: rectData.width,
    height: rectData.height,
    scaleX: 1,
    scaleY: 1,
  });
  existing.set('fill', rectData.fill || DEFAULT_FILL);
  existing.set('stroke', rectData.stroke || DEFAULT_STROKE);
  existing.setCoords();
}

/** Find a Fabric object on the canvas by its board UUID. */
export function findByBoardId(canvas: FabricCanvas, id: string): FabricObject | undefined {
  return canvas.getObjects().find((obj) => getBoardId(obj) === id);
}
