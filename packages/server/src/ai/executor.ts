import * as Y from 'yjs';
import { v4 as uuidv4 } from 'uuid';
import type {
  BoardObject,
  StickyNote,
  RectangleShape,
  Frame,
  Connector,
  TextElement,
} from '@collabboard/shared';
import {
  DEFAULT_STICKY_COLOR,
  DEFAULT_STICKY_WIDTH,
  DEFAULT_STICKY_HEIGHT,
  DEFAULT_RECT_WIDTH,
  DEFAULT_RECT_HEIGHT,
  DEFAULT_FILL,
  DEFAULT_STROKE,
  DEFAULT_FRAME_WIDTH,
  DEFAULT_FRAME_HEIGHT,
  DEFAULT_FRAME_FILL,
  DEFAULT_CONNECTOR_STROKE,
  DEFAULT_TEXT_FONT_SIZE,
  DEFAULT_TEXT_FILL,
  DEFAULT_TEXT_WIDTH,
  DEFAULT_TEXT_HEIGHT,
  MAX_OBJECTS_PER_BOARD,
  validateBoardObject,
} from '@collabboard/shared';

/** Result of executing a single tool call. */
export interface ToolResult {
  success: boolean;
  message: string;
  data?: unknown;
}

/**
 * Execute a single AI tool call against a Yjs document.
 *
 * Tool names match the spec exactly (camelCase):
 *   getBoardState, createStickyNote, createShape, createText, createFrame,
 *   createConnector, moveObject, resizeObject, updateText, changeColor
 */
export function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  doc: Y.Doc,
  userId: string,
): ToolResult {
  const objectsMap = doc.getMap('objects');

  switch (toolName) {
    case 'getBoardState': {
      const objects: BoardObject[] = [];
      objectsMap.forEach((value) => {
        const validated = validateBoardObject(value);
        if (validated) objects.push(validated);
      });
      return {
        success: true,
        message: `Board has ${String(objects.length)} objects`,
        data: objects,
      };
    }

    case 'createStickyNote': {
      if (objectsMap.size >= MAX_OBJECTS_PER_BOARD) {
        return { success: false, message: `Object limit reached (${String(MAX_OBJECTS_PER_BOARD)})` };
      }
      const id = uuidv4();
      const note: StickyNote = {
        id,
        type: 'sticky',
        x: input['x'] as number,
        y: input['y'] as number,
        width: DEFAULT_STICKY_WIDTH,
        height: DEFAULT_STICKY_HEIGHT,
        rotation: 0,
        zIndex: objectsMap.size,
        lastModifiedBy: userId,
        lastModifiedAt: Date.now(),
        parentId: null,
        text: (input['text'] as string) ?? '',
        color: (input['color'] as string) ?? DEFAULT_STICKY_COLOR,
      };
      doc.transact(() => {
        objectsMap.set(id, note);
      });
      return { success: true, message: `Created sticky note "${note.text}" at (${String(note.x)}, ${String(note.y)})`, data: { id } };
    }

    case 'createShape': {
      if (objectsMap.size >= MAX_OBJECTS_PER_BOARD) {
        return { success: false, message: `Object limit reached (${String(MAX_OBJECTS_PER_BOARD)})` };
      }
      const shapeType = input['type'] as string;
      if (shapeType !== 'rectangle') {
        return { success: false, message: `Unsupported shape type: "${shapeType}". Currently only "rectangle" is supported.` };
      }
      const id = uuidv4();
      const color = (input['color'] as string | undefined) ?? DEFAULT_FILL;
      const rect: RectangleShape = {
        id,
        type: 'rectangle',
        x: input['x'] as number,
        y: input['y'] as number,
        width: (input['width'] as number | undefined) ?? DEFAULT_RECT_WIDTH,
        height: (input['height'] as number | undefined) ?? DEFAULT_RECT_HEIGHT,
        rotation: 0,
        zIndex: objectsMap.size,
        lastModifiedBy: userId,
        lastModifiedAt: Date.now(),
        parentId: null,
        fill: color,
        stroke: DEFAULT_STROKE,
      };
      doc.transact(() => {
        objectsMap.set(id, rect);
      });
      return { success: true, message: `Created rectangle at (${String(rect.x)}, ${String(rect.y)})`, data: { id } };
    }

    case 'createFrame': {
      if (objectsMap.size >= MAX_OBJECTS_PER_BOARD) {
        return { success: false, message: `Object limit reached (${String(MAX_OBJECTS_PER_BOARD)})` };
      }
      const id = uuidv4();
      const frame: Frame = {
        id,
        type: 'frame',
        x: input['x'] as number,
        y: input['y'] as number,
        width: (input['width'] as number | undefined) ?? DEFAULT_FRAME_WIDTH,
        height: (input['height'] as number | undefined) ?? DEFAULT_FRAME_HEIGHT,
        rotation: 0,
        zIndex: 0,
        lastModifiedBy: userId,
        lastModifiedAt: Date.now(),
        parentId: null,
        title: (input['title'] as string) ?? 'Frame',
        fill: DEFAULT_FRAME_FILL,
        childrenIds: [],
      };
      doc.transact(() => {
        objectsMap.set(id, frame);
      });
      return { success: true, message: `Created frame "${frame.title}" at (${String(frame.x)}, ${String(frame.y)})`, data: { id } };
    }

    case 'createConnector': {
      if (objectsMap.size >= MAX_OBJECTS_PER_BOARD) {
        return { success: false, message: `Object limit reached (${String(MAX_OBJECTS_PER_BOARD)})` };
      }
      const fromId = input['fromId'] as string;
      const toId = input['toId'] as string;

      // Verify both objects exist
      const fromObj = objectsMap.get(fromId) as BoardObject | undefined;
      const toObj = objectsMap.get(toId) as BoardObject | undefined;
      if (!fromObj) return { success: false, message: `Source object "${fromId}" not found` };
      if (!toObj) return { success: false, message: `Target object "${toId}" not found` };

      const style = (input['style'] as 'straight' | 'curved' | undefined) ?? 'straight';
      if (style !== 'straight' && style !== 'curved') {
        return { success: false, message: `Invalid connector style: "${String(style)}". Must be "straight" or "curved".` };
      }

      const id = uuidv4();
      const connector: Connector = {
        id,
        type: 'connector',
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        rotation: 0,
        zIndex: objectsMap.size,
        lastModifiedBy: userId,
        lastModifiedAt: Date.now(),
        parentId: null,
        fromId,
        toId,
        stroke: DEFAULT_CONNECTOR_STROKE,
        style,
      };
      doc.transact(() => {
        objectsMap.set(id, connector);
      });
      return { success: true, message: `Created connector from ${fromId} to ${toId}`, data: { id } };
    }

    case 'createText': {
      if (objectsMap.size >= MAX_OBJECTS_PER_BOARD) {
        return { success: false, message: `Object limit reached (${String(MAX_OBJECTS_PER_BOARD)})` };
      }
      const id = uuidv4();
      const textEl: TextElement = {
        id,
        type: 'text',
        x: input['x'] as number,
        y: input['y'] as number,
        width: DEFAULT_TEXT_WIDTH,
        height: DEFAULT_TEXT_HEIGHT,
        rotation: 0,
        zIndex: objectsMap.size,
        lastModifiedBy: userId,
        lastModifiedAt: Date.now(),
        parentId: null,
        text: (input['text'] as string) ?? '',
        fontSize: (input['fontSize'] as number | undefined) ?? DEFAULT_TEXT_FONT_SIZE,
        fill: (input['color'] as string | undefined) ?? DEFAULT_TEXT_FILL,
      };
      doc.transact(() => {
        objectsMap.set(id, textEl);
      });
      return { success: true, message: `Created text "${textEl.text}" at (${String(textEl.x)}, ${String(textEl.y)})`, data: { id } };
    }

    case 'moveObject': {
      const objectId = input['objectId'] as string;
      const existing = objectsMap.get(objectId) as BoardObject | undefined;
      if (!existing) return { success: false, message: `Object "${objectId}" not found` };
      const newX = input['x'] as number;
      const newY = input['y'] as number;
      const deltaX = newX - existing.x;
      const deltaY = newY - existing.y;
      doc.transact(() => {
        objectsMap.set(objectId, {
          ...existing,
          x: newX,
          y: newY,
          lastModifiedBy: userId,
          lastModifiedAt: Date.now(),
        });
        // If moving a frame, move all children by the same delta
        if (existing.type === 'frame') {
          const frame = existing as Frame;
          for (const childId of frame.childrenIds) {
            const child = objectsMap.get(childId) as BoardObject | undefined;
            if (!child) continue;
            objectsMap.set(childId, {
              ...child,
              x: child.x + deltaX,
              y: child.y + deltaY,
              lastModifiedBy: userId,
              lastModifiedAt: Date.now(),
            });
          }
        }
      });
      return { success: true, message: `Moved object to (${String(newX)}, ${String(newY)})` };
    }

    case 'resizeObject': {
      const objectId = input['objectId'] as string;
      const existing = objectsMap.get(objectId) as BoardObject | undefined;
      if (!existing) return { success: false, message: `Object "${objectId}" not found` };
      if (existing.type === 'sticky') {
        return { success: false, message: `Sticky notes have a fixed size of 200x200px and cannot be resized` };
      }
      objectsMap.set(objectId, {
        ...existing,
        width: input['width'] as number,
        height: input['height'] as number,
        lastModifiedBy: userId,
        lastModifiedAt: Date.now(),
      });
      return { success: true, message: `Resized object to ${String(input['width'])}x${String(input['height'])}` };
    }

    case 'updateText': {
      const objectId = input['objectId'] as string;
      const existing = objectsMap.get(objectId) as BoardObject | undefined;
      if (!existing) return { success: false, message: `Object "${objectId}" not found` };
      const newText = input['newText'] as string;
      if (existing.type === 'sticky') {
        objectsMap.set(objectId, { ...existing, text: newText, lastModifiedBy: userId, lastModifiedAt: Date.now() });
      } else if (existing.type === 'text') {
        objectsMap.set(objectId, { ...existing, text: newText, lastModifiedBy: userId, lastModifiedAt: Date.now() });
      } else if (existing.type === 'frame') {
        objectsMap.set(objectId, { ...existing, title: newText, lastModifiedBy: userId, lastModifiedAt: Date.now() });
      } else {
        return { success: false, message: `Object "${objectId}" (type: ${existing.type}) does not have editable text` };
      }
      return { success: true, message: `Updated text to "${newText}"` };
    }

    case 'changeColor': {
      const objectId = input['objectId'] as string;
      const existing = objectsMap.get(objectId) as BoardObject | undefined;
      if (!existing) return { success: false, message: `Object "${objectId}" not found` };
      const color = input['color'] as string;
      switch (existing.type) {
        case 'sticky':
          objectsMap.set(objectId, { ...existing, color, lastModifiedBy: userId, lastModifiedAt: Date.now() });
          break;
        case 'rectangle':
          objectsMap.set(objectId, { ...existing, fill: color, lastModifiedBy: userId, lastModifiedAt: Date.now() });
          break;
        case 'text':
          objectsMap.set(objectId, { ...existing, fill: color, lastModifiedBy: userId, lastModifiedAt: Date.now() });
          break;
        case 'connector':
          objectsMap.set(objectId, { ...existing, stroke: color, lastModifiedBy: userId, lastModifiedAt: Date.now() });
          break;
        default:
          return { success: false, message: `Cannot change color of ${existing.type}` };
      }
      return { success: true, message: `Changed color to ${color}` };
    }

    default:
      return { success: false, message: `Unknown tool: ${toolName}` };
  }
}
