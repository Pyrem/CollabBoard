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

export interface Connector extends BaseBoardObject {
  type: 'connector';
  fromId: string;
  toId: string;
  stroke: string;
  style: 'straight' | 'curved';
}

export interface Frame extends BaseBoardObject {
  type: 'frame';
  title: string;
  fill: string;
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
export function isStickyNote(obj: BoardObject): obj is StickyNote {
  return obj.type === 'sticky';
}

export function isRectangleShape(obj: BoardObject): obj is RectangleShape {
  return obj.type === 'rectangle';
}

export function isCircleShape(obj: BoardObject): obj is CircleShape {
  return obj.type === 'circle';
}

export function isLineShape(obj: BoardObject): obj is LineShape {
  return obj.type === 'line';
}

export function isConnector(obj: BoardObject): obj is Connector {
  return obj.type === 'connector';
}

export function isFrame(obj: BoardObject): obj is Frame {
  return obj.type === 'frame';
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasBaseFields(obj: Record<string, unknown>): boolean {
  return (
    typeof obj['id'] === 'string' &&
    typeof obj['type'] === 'string' &&
    typeof obj['x'] === 'number' &&
    typeof obj['y'] === 'number' &&
    typeof obj['width'] === 'number' &&
    typeof obj['height'] === 'number' &&
    typeof obj['rotation'] === 'number' &&
    typeof obj['zIndex'] === 'number' &&
    typeof obj['lastModifiedBy'] === 'string' &&
    typeof obj['lastModifiedAt'] === 'number'
  );
}

function hasStringFields(obj: Record<string, unknown>, fields: string[]): boolean {
  return fields.every((f) => typeof obj[f] === 'string');
}

function hasNumberFields(obj: Record<string, unknown>, fields: string[]): boolean {
  return fields.every((f) => typeof obj[f] === 'number');
}

/** Validate that an unknown value from Yjs is a well-formed BoardObject. */
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
    case 'connector':
      if (!hasStringFields(value, ['fromId', 'toId', 'stroke'])) return null;
      if (value['style'] !== 'straight' && value['style'] !== 'curved') return null;
      break;
    case 'frame':
      if (!hasStringFields(value, ['title', 'fill'])) return null;
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
