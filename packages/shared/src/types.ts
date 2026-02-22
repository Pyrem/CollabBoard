// Board object types — discriminated union on `type` field

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

export interface StickyNote extends BaseBoardObject {
  type: 'sticky';
  text: string;
  color: string;
}

export interface RectangleShape extends BaseBoardObject {
  type: 'rectangle';
  fill: string;
  stroke: string;
}

export interface CircleShape extends BaseBoardObject {
  type: 'circle';
  fill: string;
  stroke: string;
}

export interface LineShape extends BaseBoardObject {
  type: 'line';
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
}

export type SnapPosition = 'auto' | 'top' | 'bottom' | 'left' | 'right';

export interface ConnectorEndpoint {
  id: string;
  snapTo: SnapPosition;
}

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

export interface Frame extends BaseBoardObject {
  type: 'frame';
  title: string;
  fill: string;
  childrenIds: string[];
}

export interface TextElement extends BaseBoardObject {
  type: 'text';
  text: string;
  fontSize: number;
  fill: string;
}

export type BoardObject =
  | StickyNote
  | RectangleShape
  | CircleShape
  | LineShape
  | Connector
  | Frame
  | TextElement;

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
 * Validate that an unknown value from Yjs is a well-formed {@link BoardObject}.
 *
 * Checks base fields, discriminant `type`, and type-specific fields.
 * Returns `null` for any value that doesn't conform.
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

// Cursor / presence types
export interface CursorPosition {
  x: number;
  y: number;
}

export interface UserPresence {
  userId: string;
  displayName: string;
  photoURL: string | null;
  color: string;
  cursor: CursorPosition | null;
}
