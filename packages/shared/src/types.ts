// ─── Board object types ──────────────────────────────────────────────
//
// All board objects share {@link BaseBoardObject} fields and are
// distinguished by a literal `type` discriminant.  The union
// {@link BoardObject} is used everywhere objects are read from or
// written to the Yjs `objects` Y.Map.
//
// Adding a new object type requires:
// 1. A new interface extending `BaseBoardObject` with a unique `type` literal.
// 2. A new member in the `BoardObject` union.
// 3. A type-guard function (e.g. `isCircleShape`).
// 4. A validation branch in {@link validateBoardObject}.
// 5. Fabric create/update helpers in `fabricHelpers.ts`.
// 6. A rendering case in `useObjectSync.ts`.

/**
 * Fields shared by every board object.
 *
 * @property id - UUID v4 unique identifier (also the key in the Yjs map).
 * @property type - Discriminant used by exhaustive `switch` statements.
 * @property x - Left position in canvas-space pixels.
 * @property y - Top position in canvas-space pixels.
 * @property width - Width in pixels (for connectors this is repurposed as the
 *   to-point X coordinate).
 * @property height - Height in pixels (for connectors this is repurposed as the
 *   to-point Y coordinate).
 * @property rotation - Rotation angle in degrees (0–360).
 * @property zIndex - Stack order — lower values render behind higher ones.
 * @property lastModifiedBy - Firebase UID of the user who last mutated this object.
 * @property lastModifiedAt - Unix epoch milliseconds of the last mutation.
 * @property parentId - UUID of the containing {@link Frame}, or `null` if top-level.
 */
export interface BaseBoardObject {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  lastModifiedBy: string;
  lastModifiedAt: number;
  parentId: string | null;
}

/** A coloured 200x200 px note with editable text. Fixed-size (not resizable). */
export interface StickyNote extends BaseBoardObject {
  type: 'sticky';
  /** The text content displayed inside the note. */
  text: string;
  /** Background hex colour (e.g. `"#FFEB3B"`). */
  color: string;
}

/** A resizable filled rectangle with a border stroke. */
export interface RectangleShape extends BaseBoardObject {
  type: 'rectangle';
  /** Interior fill colour (hex). */
  fill: string;
  /** Border stroke colour (hex). */
  stroke: string;
}

/** A resizable circle / ellipse with fill and stroke. (Post-MVP) */
export interface CircleShape extends BaseBoardObject {
  type: 'circle';
  fill: string;
  stroke: string;
}

/** A simple two-point line segment. (Post-MVP) */
export interface LineShape extends BaseBoardObject {
  type: 'line';
  /** End-point X in canvas-space pixels. */
  x2: number;
  /** End-point Y in canvas-space pixels. */
  y2: number;
  stroke: string;
  strokeWidth: number;
}

/** Anchor position on a connected object's bounding box. `"auto"` picks the nearest edge midpoint. */
export type SnapPosition = 'auto' | 'top' | 'bottom' | 'left' | 'right';

/** One end of a {@link Connector} — references the connected object by ID. */
export interface ConnectorEndpoint {
  /** UUID of the connected board object. */
  id: string;
  /** Which edge midpoint to attach to. */
  snapTo: SnapPosition;
}

/**
 * A line/arrow connecting two board objects.
 *
 * `x`/`y` store the computed from-point, and `width`/`height` store the
 * computed to-point (repurposed `BaseBoardObject` fields). These are updated
 * whenever a connected object moves.
 */
export interface Connector extends BaseBoardObject {
  type: 'connector';
  start: ConnectorEndpoint;
  end: ConnectorEndpoint;
  stroke: string;
  strokeWidth: number;
  style: 'straight' | 'curved';
  startCap: 'none' | 'arrow';
  endCap: 'none' | 'arrow';
}

/**
 * A titled grouping area rendered behind child objects.
 *
 * Frames cannot be children of other frames (nesting is prevented by
 * {@link useBoard.addToFrame} and {@link useBoard.reparent}).
 */
export interface Frame extends BaseBoardObject {
  type: 'frame';
  /** Title text displayed at the top-left of the frame. */
  title: string;
  /** Background fill (typically semi-transparent). */
  fill: string;
  /** UUIDs of objects currently contained inside this frame. */
  childrenIds: string[];
}

/** A standalone text label / heading — supports inline editing via Fabric IText. */
export interface TextElement extends BaseBoardObject {
  type: 'text';
  /** The text content (rendered as a Fabric Textbox). */
  text: string;
  /** Font size in pixels. */
  fontSize: number;
  /** Text colour (hex). */
  fill: string;
}

/**
 * Discriminated union of every board object type.
 *
 * The `type` field is the discriminant — always handle all cases exhaustively
 * in `switch` statements so the compiler catches missing types when a new
 * object variant is added.
 */
export type BoardObject =
  | StickyNote
  | RectangleShape
  | CircleShape
  | LineShape
  | Connector
  | Frame
  | TextElement;

/** String literal union of all valid `BoardObject.type` values. */
export type BoardObjectType = BoardObject['type'];

// Type guards

/** Narrow a {@link BoardObject} to {@link StickyNote}. */
export function isStickyNote(obj: BoardObject): obj is StickyNote {
  return obj.type === 'sticky';
}

/** Narrow a {@link BoardObject} to {@link RectangleShape}. */
export function isRectangleShape(obj: BoardObject): obj is RectangleShape {
  return obj.type === 'rectangle';
}

/** Narrow a {@link BoardObject} to {@link CircleShape}. */
export function isCircleShape(obj: BoardObject): obj is CircleShape {
  return obj.type === 'circle';
}

/** Narrow a {@link BoardObject} to {@link LineShape}. */
export function isLineShape(obj: BoardObject): obj is LineShape {
  return obj.type === 'line';
}

/** Narrow a {@link BoardObject} to {@link Connector}. */
export function isConnector(obj: BoardObject): obj is Connector {
  return obj.type === 'connector';
}

/** Narrow a {@link BoardObject} to {@link Frame}. */
export function isFrame(obj: BoardObject): obj is Frame {
  return obj.type === 'frame';
}

/** Narrow a {@link BoardObject} to {@link TextElement}. */
export function isTextElement(obj: BoardObject): obj is TextElement {
  return obj.type === 'text';
}

// Runtime validation for data coming from Yjs (untrusted)

const BOARD_OBJECT_TYPES = new Set<string>([
  'sticky',
  'rectangle',
  'circle',
  'line',
  'connector',
  'frame',
  'text',
]);

/** Check that `value` is a non-null, non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Verify that `obj` contains every field required by {@link BaseBoardObject}.
 * Also back-fills `parentId` to `null` when missing (backward compat).
 */
function hasBaseFields(obj: Record<string, unknown>): boolean {
  if (
    typeof obj['id'] !== 'string' ||
    typeof obj['type'] !== 'string' ||
    typeof obj['x'] !== 'number' ||
    typeof obj['y'] !== 'number' ||
    typeof obj['width'] !== 'number' ||
    typeof obj['height'] !== 'number' ||
    typeof obj['rotation'] !== 'number' ||
    typeof obj['zIndex'] !== 'number' ||
    typeof obj['lastModifiedBy'] !== 'string' ||
    typeof obj['lastModifiedAt'] !== 'number'
  ) {
    return false;
  }
  // Backward compat: default parentId to null if missing
  if (obj['parentId'] === undefined) {
    obj['parentId'] = null;
  } else if (obj['parentId'] !== null && typeof obj['parentId'] !== 'string') {
    return false;
  }
  return true;
}

/** Return `true` if every key in `fields` is a `string` on `obj`. */
function hasStringFields(obj: Record<string, unknown>, fields: string[]): boolean {
  return fields.every((f) => typeof obj[f] === 'string');
}

/** Return `true` if every key in `fields` is a `number` on `obj`. */
function hasNumberFields(obj: Record<string, unknown>, fields: string[]): boolean {
  return fields.every((f) => typeof obj[f] === 'number');
}

/**
 * Validate that an unknown value from the Yjs `objects` map is a well-formed
 * {@link BoardObject}.
 *
 * Checks are performed in three layers:
 * 1. **Shape check** — `value` must be a non-null, non-array object.
 * 2. **Base fields** — every {@link BaseBoardObject} field must exist with
 *    the correct type. `parentId` is back-filled to `null` for backward
 *    compatibility.
 * 3. **Discriminant + variant fields** — the `type` string must be one of
 *    the known literals, and the corresponding variant-specific fields
 *    (e.g. `text`, `color` for `'sticky'`) must be present and correctly
 *    typed.
 *
 * Returns `null` (rather than throwing) for any value that doesn't conform,
 * so callers can safely filter out malformed entries.
 *
 * @param value - Raw value retrieved from the Yjs map (untyped).
 * @returns A validated `BoardObject`, or `null` if validation fails.
 *
 * @example
 * objectsMap.forEach((raw, key) => {
 *   const obj = validateBoardObject(raw);
 *   if (obj) render(obj);
 * });
 */
export function validateBoardObject(value: unknown): BoardObject | null {
  if (!isRecord(value)) return null;
  if (!hasBaseFields(value)) return null;

  const type = value['type'] as string;
  if (!BOARD_OBJECT_TYPES.has(type)) return null;

  switch (type) {
    case 'sticky':
      if (!hasStringFields(value, ['text', 'color'])) return null;
      break;
    case 'rectangle':
    case 'circle':
      if (!hasStringFields(value, ['fill', 'stroke'])) return null;
      break;
    case 'line':
      if (!hasStringFields(value, ['stroke'])) return null;
      if (!hasNumberFields(value, ['x2', 'y2', 'strokeWidth'])) return null;
      break;
    case 'connector': {
      if (!hasStringFields(value, ['stroke'])) return null;
      if (!hasNumberFields(value, ['strokeWidth'])) return null;
      if (value['style'] !== 'straight' && value['style'] !== 'curved') return null;
      if (value['startCap'] !== 'none' && value['startCap'] !== 'arrow') return null;
      if (value['endCap'] !== 'none' && value['endCap'] !== 'arrow') return null;
      // Validate start/end ConnectorEndpoints
      if (!isRecord(value['start']) || !isRecord(value['end'])) return null;
      const start = value['start'];
      const end = value['end'];
      if (typeof start['id'] !== 'string' || typeof end['id'] !== 'string') return null;
      const validSnap = new Set(['auto', 'top', 'bottom', 'left', 'right']);
      if (!validSnap.has(start['snapTo'] as string) || !validSnap.has(end['snapTo'] as string)) return null;
      break;
    }
    case 'frame':
      if (!hasStringFields(value, ['title', 'fill'])) return null;
      // Backward compat: default childrenIds to [] if missing
      if (value['childrenIds'] === undefined) {
        value['childrenIds'] = [];
      } else if (!Array.isArray(value['childrenIds'])) {
        return null;
      }
      break;
    case 'text':
      if (!hasStringFields(value, ['text', 'fill'])) return null;
      if (!hasNumberFields(value, ['fontSize'])) return null;
      break;
    default:
      return null;
  }

  return value as unknown as BoardObject;
}

// ─── Cursor / presence types ─────────────────────────────────────────

/** A point in canvas-space coordinates (pixels, infinite board). */
export interface CursorPosition {
  x: number;
  y: number;
}

/**
 * Yjs awareness state for a single connected user.
 *
 * Broadcast via the Yjs awareness protocol and consumed by
 * {@link useCursors} (cursor rendering) and {@link usePresence}
 * (online-users panel).
 */
export interface UserPresence {
  /** Firebase UID. */
  userId: string;
  /** Display name shown on the cursor label and presence panel. */
  displayName: string;
  /** Firebase profile photo URL (nullable). */
  photoURL: string | null;
  /** Deterministic colour derived from `userId` via {@link PRESENCE_COLORS}. */
  color: string;
  /** Last known cursor position, or `null` if the cursor is off-canvas. */
  cursor: CursorPosition | null;
}

// ─── Board metadata types ────────────────────────────────────────────

/** Metadata for a board (stored in SQLite, separate from the Yjs document blob). */
export interface BoardMetadata {
  id: string;
  title: string;
  ownerId: string;
  ownerName: string;
  createdAt: number;
  updatedAt: number;
}
