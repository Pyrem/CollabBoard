import type Anthropic from '@anthropic-ai/sdk';

/**
 * Tool definitions for the CollabBoard AI agent.
 *
 * Each tool maps to a board operation the AI can invoke.
 * The executor in `executor.ts` handles the actual Yjs writes.
 */

export const aiTools: Anthropic.Tool[] = [
  {
    name: 'get_board_state',
    description:
      'Get the current state of all objects on the board. Returns an array of objects with their properties. Use this to understand the current board layout before making changes.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'create_sticky_note',
    description:
      'Create a sticky note on the board. Sticky notes are colored squares with text inside them.',
    input_schema: {
      type: 'object' as const,
      properties: {
        text: { type: 'string', description: 'The text content of the sticky note' },
        x: { type: 'number', description: 'X position on the canvas' },
        y: { type: 'number', description: 'Y position on the canvas' },
        color: {
          type: 'string',
          description: 'Hex color for the sticky note background. Available colors: #FFEB3B (yellow), #FF9800 (orange), #E91E63 (pink), #4CAF50 (green), #2196F3 (blue), #9C27B0 (purple)',
        },
      },
      required: ['text', 'x', 'y'],
    },
  },
  {
    name: 'create_rectangle',
    description: 'Create a rectangle shape on the board.',
    input_schema: {
      type: 'object' as const,
      properties: {
        x: { type: 'number', description: 'X position on the canvas' },
        y: { type: 'number', description: 'Y position on the canvas' },
        width: { type: 'number', description: 'Width in pixels (default 150)' },
        height: { type: 'number', description: 'Height in pixels (default 100)' },
        fill: { type: 'string', description: 'Fill color (hex)' },
        stroke: { type: 'string', description: 'Stroke/border color (hex)' },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'create_text',
    description: 'Create a standalone text element on the board.',
    input_schema: {
      type: 'object' as const,
      properties: {
        text: { type: 'string', description: 'The text content' },
        x: { type: 'number', description: 'X position on the canvas' },
        y: { type: 'number', description: 'Y position on the canvas' },
        fontSize: { type: 'number', description: 'Font size in pixels (default 20)' },
        fill: { type: 'string', description: 'Text color (hex, default #333333)' },
      },
      required: ['text', 'x', 'y'],
    },
  },
  {
    name: 'create_frame',
    description:
      'Create a frame on the board. Frames are titled rectangular areas used to visually group other objects.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Frame title text' },
        x: { type: 'number', description: 'X position on the canvas' },
        y: { type: 'number', description: 'Y position on the canvas' },
        width: { type: 'number', description: 'Width in pixels (default 400)' },
        height: { type: 'number', description: 'Height in pixels (default 300)' },
      },
      required: ['title', 'x', 'y'],
    },
  },
  {
    name: 'create_connector',
    description:
      'Create a connector line between two existing objects on the board. Both objects must already exist.',
    input_schema: {
      type: 'object' as const,
      properties: {
        fromId: { type: 'string', description: 'ID of the source object' },
        toId: { type: 'string', description: 'ID of the target object' },
        stroke: { type: 'string', description: 'Line color (hex, default #666666)' },
      },
      required: ['fromId', 'toId'],
    },
  },
  {
    name: 'move_object',
    description: 'Move an existing object to a new position.',
    input_schema: {
      type: 'object' as const,
      properties: {
        objectId: { type: 'string', description: 'ID of the object to move' },
        x: { type: 'number', description: 'New X position' },
        y: { type: 'number', description: 'New Y position' },
      },
      required: ['objectId', 'x', 'y'],
    },
  },
  {
    name: 'resize_object',
    description: 'Resize an existing object.',
    input_schema: {
      type: 'object' as const,
      properties: {
        objectId: { type: 'string', description: 'ID of the object to resize' },
        width: { type: 'number', description: 'New width in pixels' },
        height: { type: 'number', description: 'New height in pixels' },
      },
      required: ['objectId', 'width', 'height'],
    },
  },
  {
    name: 'update_text',
    description: 'Update the text content of a sticky note or text element.',
    input_schema: {
      type: 'object' as const,
      properties: {
        objectId: { type: 'string', description: 'ID of the object to update' },
        text: { type: 'string', description: 'New text content' },
      },
      required: ['objectId', 'text'],
    },
  },
  {
    name: 'change_color',
    description: 'Change the color of an existing object.',
    input_schema: {
      type: 'object' as const,
      properties: {
        objectId: { type: 'string', description: 'ID of the object to update' },
        color: { type: 'string', description: 'New color (hex)' },
      },
      required: ['objectId', 'color'],
    },
  },
  {
    name: 'delete_object',
    description: 'Delete an object from the board.',
    input_schema: {
      type: 'object' as const,
      properties: {
        objectId: { type: 'string', description: 'ID of the object to delete' },
      },
      required: ['objectId'],
    },
  },
  {
    name: 'delete_all',
    description: 'Delete all objects from the board. Use with caution.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
];
