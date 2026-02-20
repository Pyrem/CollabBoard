// Board limits
export const MAX_OBJECTS_PER_BOARD = 500;
export const MAX_BOARD_NAME_LENGTH = 100;

// Default colors for sticky notes
export const DEFAULT_STICKY_COLOR = '#FFEB3B';
export const STICKY_COLORS = [
  '#FFEB3B', // yellow
  '#FF9800', // orange
  '#E91E63', // pink
  '#4CAF50', // green
  '#2196F3', // blue
  '#9C27B0', // purple
] as const;

// Default object dimensions
export const DEFAULT_STICKY_WIDTH = 200;
export const DEFAULT_STICKY_HEIGHT = 200;
export const DEFAULT_RECT_WIDTH = 150;
export const DEFAULT_RECT_HEIGHT = 100;
export const DEFAULT_CIRCLE_WIDTH = 100;
export const DEFAULT_CIRCLE_HEIGHT = 100;

// Default frame properties
export const DEFAULT_FRAME_WIDTH = 400;
export const DEFAULT_FRAME_HEIGHT = 300;
export const DEFAULT_FRAME_FILL = 'rgba(200, 200, 200, 0.15)';
export const DEFAULT_FRAME_TITLE = 'Frame';

// Default text element properties
export const DEFAULT_TEXT_FONT_SIZE = 20;
export const DEFAULT_TEXT_FILL = '#333333';
export const DEFAULT_TEXT_WIDTH = 200;
export const DEFAULT_TEXT_HEIGHT = 30;

// Default colors for shapes
export const DEFAULT_FILL = '#4CAF50';
export const DEFAULT_STROKE = '#000000';
export const DEFAULT_STROKE_WIDTH = 2;

// Consolidated throttle configuration
export const THROTTLE = {
  CURSOR_MS: 30,          // normal cursor broadcast interval
  CURSOR_HEAVY_MS: 100,   // cursor during heavy operations (group drag)
  BASE_MS: 50,            // single-object sync minimum
  PER_SHAPE_MS: 2,        // added per selected shape in a group operation
  MAX_MS: 500,            // absolute cap for adaptive throttle
  COLOR_CHANGE_MS: 100,   // color picker debounce
} as const;

/**
 * Compute an adaptive throttle interval based on connected user count and
 * the number of objects in the current selection.
 *
 * More users or larger selections → higher throttle to reduce network load.
 * Capped at {@link THROTTLE.MAX_MS}.
 */
export function getAdaptiveThrottleMs(
  userCount: number,
  selectionSize: number,
): number {
  let base: number;
  if (userCount <= 5) base = 50;
  else if (userCount <= 10) base = 100;
  else base = 200;
  return Math.min(base + THROTTLE.PER_SHAPE_MS * selectionSize, THROTTLE.MAX_MS);
}

// --- Deprecated aliases (kept so existing call sites compile) ---

/** @deprecated Use THROTTLE.CURSOR_MS */
export const CURSOR_THROTTLE_MS = THROTTLE.CURSOR_MS;

/** @deprecated Use getAdaptiveThrottleMs */
export const OBJECT_SYNC_THROTTLE_MS = THROTTLE.BASE_MS;

/** @deprecated Use getAdaptiveThrottleMs */
export function getObjectSyncThrottle(userCount: number): number {
  return getAdaptiveThrottleMs(userCount, 1);
}

// Presence colors assigned to users
export const PRESENCE_COLORS = [
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#96CEB4',
  '#FFEAA7',
  '#DDA0DD',
  '#98D8C8',
  '#F7DC6F',
  '#BB8FCE',
  '#85C1E9',
] as const;

// AI
export const AI_RATE_LIMIT_PER_MINUTE = 10;
export const AI_MAX_TOOL_CALLS_PER_REQUEST = 20;
