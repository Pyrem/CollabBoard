import * as Y from 'yjs';
import { v4 as uuidv4 } from 'uuid';
import type {
  BoardObject,
  StickyNote,
  RectangleShape,
  TextElement,
  Frame,
  Connector,
} from '@collabboard/shared';
import {
  DEFAULT_STICKY_COLOR,
  DEFAULT_STICKY_WIDTH,
  DEFAULT_STICKY_HEIGHT,
  DEFAULT_RECT_WIDTH,
  DEFAULT_RECT_HEIGHT,
  DEFAULT_FILL,
  DEFAULT_STROKE,
  DEFAULT_TEXT_FONT_SIZE,
  DEFAULT_TEXT_FILL,
  DEFAULT_TEXT_WIDTH,
  DEFAULT_TEXT_HEIGHT,
  DEFAULT_FRAME_WIDTH,
  DEFAULT_FRAME_HEIGHT,
  DEFAULT_FRAME_FILL,
  DEFAULT_CONNECTOR_STROKE,
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
 * The executor reads from and writes to `objectsMap` (the `Y.Map('objects')`)
 * directly. Changes propagate to all connected clients via normal Yjs sync.
 *
 * @param toolName - Name of the tool to execute
 * @param input    - Tool input parameters (parsed from Claude's response)
 * @param doc      - The Yjs document for this board
 * @param userId   - The user ID to stamp on created/modified objects
 */
export function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  doc: Y.Doc,
  userId: string,
): ToolResult {
  const objectsMap = doc.getMap('objects');

  switch (toolName) {
    case 'get_board_state': {
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

    case 'create_sticky_note': {
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
        text: (input['text'] as string) ?? '',
        color: (input['color'] as string) ?? DEFAULT_STICKY_COLOR,
      };
      objectsMap.set(id, note);
      return { success: true, message: `Created sticky note "${note.text}" at (${String(note.x)}, ${String(note.y)})`, data: { id } };
    }

    case 'create_rectangle': {
      if (objectsMap.size >= MAX_OBJECTS_PER_BOARD) {
        return { success: false, message: `Object limit reached (${String(MAX_OBJECTS_PER_BOARD)})` };
      }
      const id = uuidv4();
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
        fill: (input['fill'] as string) ?? DEFAULT_FILL,
        stroke: (input['stroke'] as string) ?? DEFAULT_STROKE,
      };
      objectsMap.set(id, rect);
      return { success: true, message: `Created rectangle at (${String(rect.x)}, ${String(rect.y)})`, data: { id } };
    }

    case 'create_text': {
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
        text: (input['text'] as string) ?? 'Text',
        fontSize: (input['fontSize'] as number | undefined) ?? DEFAULT_TEXT_FONT_SIZE,
        fill: (input['fill'] as string) ?? DEFAULT_TEXT_FILL,
      };
      objectsMap.set(id, textEl);
      return { success: true, message: `Created text "${textEl.text}" at (${String(textEl.x)}, ${String(textEl.y)})`, data: { id } };
    }

    case 'create_frame': {
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
        title: (input['title'] as string) ?? 'Frame',
        fill: DEFAULT_FRAME_FILL,
      };
      objectsMap.set(id, frame);
      return { success: true, message: `Created frame "${frame.title}" at (${String(frame.x)}, ${String(frame.y)})`, data: { id } };
    }

    case 'create_connector': {
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

      const id = uuidv4();
      const connector: Connector = {
        id,
        type: 'connector',
        // Store zeros — the client computes actual endpoints from object positions
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        rotation: 0,
        zIndex: objectsMap.size,
        lastModifiedBy: userId,
        lastModifiedAt: Date.now(),
        fromId,
        toId,
        stroke: (input['stroke'] as string) ?? DEFAULT_CONNECTOR_STROKE,
        style: 'straight',
      };
      objectsMap.set(id, connector);
      return { success: true, message: `Created connector from ${fromId} to ${toId}`, data: { id } };
    }

    case 'move_object': {
      const objectId = input['objectId'] as string;
      const existing = objectsMap.get(objectId) as BoardObject | undefined;
      if (!existing) return { success: false, message: `Object "${objectId}" not found` };
      objectsMap.set(objectId, {
        ...existing,
        x: input['x'] as number,
        y: input['y'] as number,
        lastModifiedBy: userId,
        lastModifiedAt: Date.now(),
      });
      return { success: true, message: `Moved object to (${String(input['x'])}, ${String(input['y'])})` };
    }

    case 'resize_object': {
      const objectId = input['objectId'] as string;
      const existing = objectsMap.get(objectId) as BoardObject | undefined;
      if (!existing) return { success: false, message: `Object "${objectId}" not found` };
      objectsMap.set(objectId, {
        ...existing,
        width: input['width'] as number,
        height: input['height'] as number,
        lastModifiedBy: userId,
        lastModifiedAt: Date.now(),
      });
      return { success: true, message: `Resized object to ${String(input['width'])}x${String(input['height'])}` };
    }

    case 'update_text': {
      const objectId = input['objectId'] as string;
      const existing = objectsMap.get(objectId) as BoardObject | undefined;
      if (!existing) return { success: false, message: `Object "${objectId}" not found` };
      const newText = input['text'] as string;
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

    case 'change_color': {
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

    case 'delete_object': {
      const objectId = input['objectId'] as string;
      if (!objectsMap.has(objectId)) {
        return { success: false, message: `Object "${objectId}" not found` };
      }
      // Also delete connectors referencing this object
      const connectorIds: string[] = [];
      objectsMap.forEach((value, key) => {
        const obj = validateBoardObject(value);
        if (obj?.type === 'connector') {
          const conn = obj as Connector;
          if (conn.fromId === objectId || conn.toId === objectId) {
            connectorIds.push(key);
          }
        }
      });
      doc.transact(() => {
        objectsMap.delete(objectId);
        for (const cid of connectorIds) {
          objectsMap.delete(cid);
        }
      });
      return {
        success: true,
        message: connectorIds.length > 0
          ? `Deleted object and ${String(connectorIds.length)} connected connector(s)`
          : 'Deleted object',
      };
    }

    case 'delete_all': {
      const keys = Array.from(objectsMap.keys());
      doc.transact(() => {
        for (const key of keys) {
          objectsMap.delete(key);
        }
      });
      return { success: true, message: `Deleted all ${String(keys.length)} objects` };
    }

    default:
      return { success: false, message: `Unknown tool: ${toolName}` };
  }
}
