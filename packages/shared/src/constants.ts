// ─── Board limits ────────────────────────────────────────────────────

/** Hard cap on objects per board. Enforced server-side in {@link executeTool} and client-side in {@link useBoard}. */
export const MAX_OBJECTS_PER_BOARD = 500;

/** Maximum allowed length for a board / document name. */
export const MAX_BOARD_NAME_LENGTH = 100;

// ─── Default sticky note properties ─────────────────────────────────

/** Default background colour for new sticky notes (yellow). */
export const DEFAULT_STICKY_COLOR = '#FFEB3B';

/**
 * Palette of sticky note background colours offered in the toolbar.
 *
 * The order matches the colour swatches rendered in the {@link Toolbar}
 * component (left → right).
 */
export const STICKY_COLORS = [
  '#FFEB3B', // yellow
  '#FF9800', // orange
  '#E91E63', // pink
  '#4CAF50', // green
  '#2196F3', // blue
  '#9C27B0', // purple
] as const;

// ─── Default object dimensions ───────────────────────────────────────

/** Fixed width of a sticky note in canvas-space pixels. */
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

// Default connector properties
export const DEFAULT_CONNECTOR_STROKE = '#666666';
export const DEFAULT_CONNECTOR_STROKE_WIDTH = 2;
export const CONNECTOR_ARROW_SIZE = 10;

// Default colors for shapes
export const DEFAULT_FILL = '#4CAF50';
export const DEFAULT_STROKE = '#000000';
export const DEFAULT_STROKE_WIDTH = 2;

// ─── Throttle configuration ──────────────────────────────────────────

/**
 * Consolidated throttle intervals used by both cursor broadcasting and
 * object-sync during interactive manipulation (move/scale/rotate).
 *
 * Individual values are referenced from `useCursors`, `localModifications`,
 * and `Toolbar` (colour-change debounce).
 */
export const THROTTLE = {
  CURSOR_MS: 30,          // normal cursor broadcast interval
  CURSOR_HEAVY_MS: 100,   // cursor during heavy operations (group drag)
  BASE_MS: 50,            // single-object sync minimum
  PER_SHAPE_MS: 2,        // added per selected shape in a group operation
  MAX_MS: 500,            // absolute cap for adaptive throttle
  COLOR_CHANGE_MS: 100,   // color picker debounce
} as const;

/**
 * Compute an adaptive throttle interval (in ms) for Yjs sync writes during
 * interactive manipulation.
 *
 * The interval increases with the number of connected users (to reduce
 * network traffic) and with the size of the current multi-select (to avoid
 * flooding the Yjs document with per-object updates). The result is
 * clamped to {@link THROTTLE.MAX_MS}.
 *
 * | User count | Base ms |
 * |------------|---------|
 * | 1–5        | 50      |
 * | 6–10       | 100     |
 * | 11+        | 200     |
 *
 * @param userCount - Number of currently connected WebSocket clients.
 * @param selectionSize - Number of objects in the active Fabric selection.
 * @returns Throttle interval in milliseconds.
 *
 * @see {@link THROTTLE} for the underlying constants.
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

// ─── Presence colours ────────────────────────────────────────────────

/**
 * Palette of colours assigned to users for cursor arrows and presence dots.
 *
 * A user's colour is chosen deterministically by hashing their `userId`
 * into an index: `PRESENCE_COLORS[hash(userId) % PRESENCE_COLORS.length]`.
 */
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

// ─── WebSocket connection limits ─────────────────────────────────────

/** Maximum concurrent WebSocket connections allowed from a single IP address. */
export const MAX_CONNECTIONS_PER_IP = 10;

/** Maximum concurrent WebSocket connections allowed for a single authenticated user. */
export const MAX_CONNECTIONS_PER_USER = 5;

// ─── AI agent limits ─────────────────────────────────────────────────

/** Maximum AI command requests per IP per minute (enforced by `express-rate-limit`). */
export const AI_RATE_LIMIT_PER_MINUTE = 10;

/** Maximum tool call iterations within a single agentic loop before force-returning. */
export const AI_MAX_TOOL_CALLS_PER_REQUEST = 20;
