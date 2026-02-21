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
 * Frame x/y is the top-left corner (Fabric default originX:'left',
 * originY:'top'). Since frames don't rotate, no rotation math is needed.
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
 * Collect all frames from a list of board objects.
 */
export function getAllFrames(objects: BoardObject[]): Frame[] {
  return objects.filter((obj): obj is Frame => obj.type === 'frame');
}
