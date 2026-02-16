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

// Default colors for shapes
export const DEFAULT_FILL = '#FFFFFF';
export const DEFAULT_STROKE = '#333333';
export const DEFAULT_STROKE_WIDTH = 2;

// Cursor
export const CURSOR_THROTTLE_MS = 30;

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
