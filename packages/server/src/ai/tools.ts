import type Anthropic from '@anthropic-ai/sdk';

/**
 * Anthropic tool definitions for the CollabBoard AI agent.
 *
 * Each entry maps 1-to-1 with a `case` in {@link executeTool} (`executor.ts`).
 * The `input_schema` follows JSON Schema and is sent verbatim to Claude so it
 * knows which parameters are available and required.
 *
 * **11 tools** organised into four categories:
 *
 * | Category     | Tools                                                     |
 * |--------------|-----------------------------------------------------------|
 * | Inspection   | `getBoardState`                                           |
 * | Creation     | `createStickyNote`, `createShape`, `createText`,          |
 * |              | `createFrame`, `createConnector`                          |
 * | Manipulation | `moveObject`, `resizeObject`, `updateText`, `changeColor` |
 * | Diagrams     | `createDiagram`                                           |
 *
 * @see {@link executeTool} for the server-side implementation of each tool.
 * @see {@link SYSTEM_PROMPT} for the instructions that accompany these tools.
 */
export const aiTools: Anthropic.Tool[] = [
  {
    name: 'getBoardState',
    description:
      'Get the current state of all objects on the board. Returns an array of objects with their properties (id, type, position, dimensions, colors, text). Use this to understand the board layout before making changes.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'createStickyNote',
    description:
      'Create a sticky note on the board. Sticky notes are colored squares of a fixed 200x200px size with editable text inside.',
    input_schema: {
      type: 'object' as const,
      properties: {
        text: { type: 'string', description: 'The text content of the sticky note' },
        x: { type: 'number', description: 'X position on the canvas' },
        y: { type: 'number', description: 'Y position on the canvas' },
        color: {
          type: 'string',
          description:
            'Hex color for the sticky note background. Available: #FFEB3B (yellow), #FF9800 (orange), #E91E63 (pink), #4CAF50 (green), #2196F3 (blue), #9C27B0 (purple). Defaults to yellow.',
        },
      },
      required: ['text', 'x', 'y'],
    },
  },
  {
    name: 'createShape',
    description:
      'Create a shape on the board. Supports rectangles and circles. Use for visual containers, dividers, or decorative elements.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          enum: ['rectangle', 'circle'],
          description: 'Shape type: "rectangle" or "circle".',
        },
        x: { type: 'number', description: 'X position on the canvas' },
        y: { type: 'number', description: 'Y position on the canvas' },
        width: { type: 'number', description: 'Width in pixels (default 150 for rectangle, 100 for circle)' },
        height: { type: 'number', description: 'Height in pixels (default 100 for rectangle, 100 for circle)' },
        color: { type: 'string', description: 'Fill color as hex string (default #4CAF50)' },
      },
      required: ['type', 'x', 'y'],
    },
  },
  {
    name: 'createFrame',
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
    name: 'createConnector',
    description:
      'Create a connector line between two existing objects on the board. Both objects must already exist. Connectors attach to anchor points on shapes — by default "auto" picks the nearest edge.',
    input_schema: {
      type: 'object' as const,
      properties: {
        fromId: { type: 'string', description: 'ID of the source object' },
        toId: { type: 'string', description: 'ID of the target object' },
        fromSnapTo: {
          type: 'string',
          enum: ['auto', 'top', 'bottom', 'left', 'right'],
          description: 'Anchor point on the source object (default "auto")',
        },
        toSnapTo: {
          type: 'string',
          enum: ['auto', 'top', 'bottom', 'left', 'right'],
          description: 'Anchor point on the target object (default "auto")',
        },
        style: {
          type: 'string',
          enum: ['straight', 'curved'],
          description: 'Connector line style (default "straight")',
        },
        endCap: {
          type: 'string',
          enum: ['none', 'arrow'],
          description: 'End cap style — "arrow" shows an arrowhead at the target (default "arrow")',
        },
        startCap: {
          type: 'string',
          enum: ['none', 'arrow'],
          description: 'Start cap style (default "none")',
        },
      },
      required: ['fromId', 'toId'],
    },
  },
  {
    name: 'createText',
    description:
      'Create a standalone text element on the board. Use for labels, headers, or any free-form text that is not inside a sticky note.',
    input_schema: {
      type: 'object' as const,
      properties: {
        text: { type: 'string', description: 'The text content' },
        x: { type: 'number', description: 'X position on the canvas' },
        y: { type: 'number', description: 'Y position on the canvas' },
        fontSize: { type: 'number', description: 'Font size in pixels (default 20)' },
        color: { type: 'string', description: 'Text color as hex string (default #333333)' },
      },
      required: ['text', 'x', 'y'],
    },
  },
  {
    name: 'moveObject',
    description: 'Move an existing object to a new position on the board.',
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
    name: 'resizeObject',
    description: 'Resize an existing object on the board.',
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
    name: 'updateText',
    description:
      'Update the text content of a sticky note, text element, or frame title.',
    input_schema: {
      type: 'object' as const,
      properties: {
        objectId: { type: 'string', description: 'ID of the object to update' },
        newText: { type: 'string', description: 'New text content' },
      },
      required: ['objectId', 'newText'],
    },
  },
  {
    name: 'changeColor',
    description:
      'Change the color of an existing object. Sets the fill for shapes, background for sticky notes, or stroke for connectors.',
    input_schema: {
      type: 'object' as const,
      properties: {
        objectId: { type: 'string', description: 'ID of the object to update' },
        color: { type: 'string', description: 'New color as hex string (e.g. "#FF0000")' },
      },
      required: ['objectId', 'color'],
    },
  },
  {
    name: 'createDiagram',
    description:
      'Create a structured diagram from a template. Use this for complex, multi-object layouts like SWOT analyses. The diagram will be automatically planned, laid out with proper spacing, and rendered with colour-coded elements. Do NOT manually create frames and stickies when a diagram template is available — use this tool instead.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          enum: ['swot'],
          description:
            'The diagram template type. Currently supported: "swot" (SWOT analysis with 4 quadrants).',
        },
        topic: {
          type: 'string',
          description:
            'The subject or topic for the diagram (e.g. "launching a catering business", "our Q3 product strategy").',
        },
      },
      required: ['type', 'topic'],
    },
  },
];
