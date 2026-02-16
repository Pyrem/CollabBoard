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
