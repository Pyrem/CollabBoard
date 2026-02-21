import type { Frame, BoardObject } from '@collabboard/shared';

/** Axis-aligned bounding box for a frame (frames don't rotate). */
export interface FrameBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Compute axis-aligned bounds for a frame.
 *
 * Frame x/y is the center (Fabric default origin), so we offset by half
 * width/height. Since frames don't rotate, no rotation math is needed.
 */
export function getFrameBounds(frame: Frame): FrameBounds {
  return {
    left: frame.x - frame.width / 2,
    top: frame.y - frame.height / 2,
    right: frame.x + frame.width / 2,
    bottom: frame.y + frame.height / 2,
  };
}

/**
 * Test whether a point (object center) falls inside a frame's bounding box.
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
 * If multiple frames overlap, returns the smallest (by area) so that a
 * tight-fitting frame takes priority. Returns `null` if no frame contains
 * the point.
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
 * Given a frame's children, return the IDs of children whose centers
 * are no longer within the frame's bounds (for eviction after resize).
 */
export function findEvictedChildren(
  frame: Frame,
  allObjects: BoardObject[],
): string[] {
  const bounds = getFrameBounds(frame);
  const evicted: string[] = [];

  for (const obj of allObjects) {
    if (obj.parentId !== frame.id) continue;
    if (!isInsideFrame(obj.x, obj.y, bounds)) {
      evicted.push(obj.id);
    }
  }

  return evicted;
}

/**
 * Collect all frames from a list of board objects.
 */
export function getAllFrames(objects: BoardObject[]): Frame[] {
  return objects.filter((obj): obj is Frame => obj.type === 'frame');
}
