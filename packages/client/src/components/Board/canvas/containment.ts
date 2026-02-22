import type { Frame, BoardObject } from '@collabboard/shared';

/**
 * Axis-aligned bounding box for a frame.
 *
 * Frames do not rotate (`lockRotation: true`) so a simple AABB is sufficient
 * for all containment tests. Computed by {@link getFrameBounds}.
 */
export interface FrameBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Compute axis-aligned bounds for a frame.
 *
 * Frame `x`/`y` is the top-left corner (Fabric default `originX:'left'`,
 * `originY:'top'`). Since frames don't rotate (`lockRotation: true`), no
 * trigonometric decomposition is needed.
 *
 * @param frame - Validated {@link Frame} from the Yjs map.
 * @returns The AABB as `{ left, top, right, bottom }`.
 */
export function getFrameBounds(frame: Frame): FrameBounds {
  return {
    left: frame.x,
    top: frame.y,
    right: frame.x + frame.width,
    bottom: frame.y + frame.height,
  };
}

/**
 * Test whether a point (typically an object's center) falls inside a frame's
 * axis-aligned bounding box.
 *
 * @param centerX - X coordinate of the point to test.
 * @param centerY - Y coordinate of the point to test.
 * @param bounds - Pre-computed {@link FrameBounds}.
 * @returns `true` if the point is inside (inclusive of edges).
 */
export function isInsideFrame(
  centerX: number,
  centerY: number,
  bounds: FrameBounds,
): boolean {
  return (
    centerX >= bounds.left &&
    centerX <= bounds.right &&
    centerY >= bounds.top &&
    centerY <= bounds.bottom
  );
}

/**
 * Find the frame that contains the given center point.
 *
 * If multiple frames overlap, returns the **smallest** (by area) so that a
 * tight-fitting frame takes priority over a larger outer frame. Returns
 * `null` if no frame contains the point.
 *
 * @param centerX - X coordinate of the point to test.
 * @param centerY - Y coordinate of the point to test.
 * @param frames - All frames on the board (obtained via {@link getAllFrames}).
 * @returns The smallest containing {@link Frame}, or `null`.
 */
export function findContainingFrame(
  centerX: number,
  centerY: number,
  frames: Frame[],
): Frame | null {
  let best: Frame | null = null;
  let bestArea = Infinity;

  for (const frame of frames) {
    const bounds = getFrameBounds(frame);
    if (isInsideFrame(centerX, centerY, bounds)) {
      const area = frame.width * frame.height;
      if (area < bestArea) {
        best = frame;
        bestArea = area;
      }
    }
  }

  return best;
}

/**
 * Return the IDs of a frame's children whose centres have fallen outside
 * the frame's bounds.
 *
 * Called after a frame resize to evict objects that are no longer visually
 * inside. Connectors are skipped because their `width`/`height` fields
 * store endpoint coordinates, not dimensions.
 *
 * @param frame - The resized frame (with updated dimensions).
 * @param allObjects - The full list of board objects (used to look up children
 *   by `parentId`).
 * @returns An array of UUIDs that should be unparented.
 */
export function findEvictedChildren(
  frame: Frame,
  allObjects: BoardObject[],
): string[] {
  const bounds = getFrameBounds(frame);
  const evicted: string[] = [];

  for (const obj of allObjects) {
    if (obj.parentId !== frame.id) continue;
    // Skip connectors — their width/height fields are repurposed as endpoint coords
    if (obj.type === 'connector') continue;
    const centerX = obj.x + obj.width / 2;
    const centerY = obj.y + obj.height / 2;
    if (!isInsideFrame(centerX, centerY, bounds)) {
      evicted.push(obj.id);
    }
  }

  return evicted;
}

/**
 * Filter a list of board objects to only {@link Frame} instances.
 *
 * Uses a TypeScript type-guard predicate so the caller gets `Frame[]`
 * with no additional casting.
 *
 * @param objects - All board objects (e.g. from {@link useBoard.getAllObjects}).
 * @returns Only the frames.
 */
export function getAllFrames(objects: BoardObject[]): Frame[] {
  return objects.filter((obj): obj is Frame => obj.type === 'frame');
}
