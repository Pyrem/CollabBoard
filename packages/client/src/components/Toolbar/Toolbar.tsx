import { useRef, useState } from 'react';
import type { useBoard } from '../../hooks/useBoard.js';
import type { SelectedObject } from '../Board/Canvas.js';
import type { BoardObject } from '@collabboard/shared';
import { STICKY_COLORS, MAX_OBJECTS_PER_BOARD, THROTTLE } from '@collabboard/shared';

interface ToolbarProps {
  board: ReturnType<typeof useBoard>;
  selectedObject: SelectedObject | null;
  getSceneCenter: () => { x: number; y: number };
}

type Tool = 'select' | 'sticky' | 'rectangle';

export function Toolbar({ board, selectedObject, getSceneCenter }: ToolbarProps): React.JSX.Element {
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [selectedColor, setSelectedColor] = useState<string>(STICKY_COLORS[0]);
  const lastColorChangeRef = useRef(0);

  const objectCount = board.getObjectCount();
  const atLimit = objectCount >= MAX_OBJECTS_PER_BOARD;

  const handleToolClick = (tool: Tool): void => {
    const center = getSceneCenter();
    let result: string | null = null;
    if (tool === 'sticky') {
      result = board.createStickyNote(
        center.x - 100,
        center.y - 100,
        '',
        selectedColor,
      );
    } else if (tool === 'rectangle') {
      result = board.createRectangle(
        center.x - 75,
        center.y - 50,
        undefined,
        undefined,
        selectedColor,
      );
    }
    if (result === null && tool !== 'select') {
      window.alert(`Object limit reached (${String(MAX_OBJECTS_PER_BOARD)}). Delete some objects before creating new ones.`);
      return;
    }
    setActiveTool(tool);
  };

  const handleColorClick = (color: string): void => {
    setSelectedColor(color);
    // If an object is selected, update its color in-place (throttled)
    if (selectedObject) {
      const now = performance.now();
      if (now - lastColorChangeRef.current < THROTTLE.COLOR_CHANGE_MS) return;
      lastColorChangeRef.current = now;

      if (selectedObject.type === 'sticky') {
        board.updateObject(selectedObject.id, { color } as Partial<BoardObject>);
      } else if (selectedObject.type === 'rectangle') {
        board.updateObject(selectedObject.id, { fill: color } as Partial<BoardObject>);
      }
    }
  };

  return (
    <div style={styles.toolbar}>
      <button
        style={{
          ...styles.toolBtn,
          ...(activeTool === 'select' ? styles.active : {}),
        }}
        onClick={() => setActiveTool('select')}
        title="Select (V)"
      >
        Select
      </button>
      <button
        style={{
          ...styles.toolBtn,
          ...(activeTool === 'sticky' ? styles.active : {}),
        }}
        onClick={() => handleToolClick('sticky')}
        title="Sticky Note (S)"
      >
        Sticky
      </button>
      <button
        style={{
          ...styles.toolBtn,
          ...(activeTool === 'rectangle' ? styles.active : {}),
        }}
        onClick={() => handleToolClick('rectangle')}
        title="Rectangle (R)"
      >
        Rect
      </button>

      <div style={styles.separator} />

      <button
        style={styles.clearBtn}
        onClick={() => {
          if (window.confirm('Clear all objects from the board?')) {
            board.clearAll();
          }
        }}
        title="Clear Board"
      >
        Clear
      </button>

      <div style={styles.separator} />

      {STICKY_COLORS.map((color) => (
        <button
          key={color}
          style={{
            ...styles.colorBtn,
            backgroundColor: color,
            ...(selectedColor === color ? { outline: '2px solid #333', outlineOffset: 2 } : {}),
          }}
          onClick={() => handleColorClick(color)}
          title={color}
        />
      ))}

      <div style={styles.separator} />

      <span
        style={{
          ...styles.objectCount,
          ...(atLimit ? styles.objectCountAtLimit : {}),
        }}
        title={`${String(objectCount)} / ${String(MAX_OBJECTS_PER_BOARD)} objects`}
      >
        {String(objectCount)}/{String(MAX_OBJECTS_PER_BOARD)}
      </span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  toolbar: {
    position: 'absolute',
    bottom: 20,
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: '#fff',
    borderRadius: 12,
    boxShadow: '0 2px 16px rgba(0,0,0,0.15)',
    padding: '8px 12px',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    zIndex: 100,
  },
  toolBtn: {
    padding: '6px 14px',
    border: '1px solid #ddd',
    borderRadius: 8,
    backgroundColor: '#fff',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
  },
  active: {
    backgroundColor: '#e3f2fd',
    borderColor: '#2196F3',
    color: '#1565C0',
  },
  clearBtn: {
    padding: '6px 14px',
    border: '1px solid #e57373',
    borderRadius: 8,
    backgroundColor: '#fff',
    color: '#c62828',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
  },
  separator: {
    width: 1,
    height: 24,
    backgroundColor: '#ddd',
    margin: '0 4px',
  },
  colorBtn: {
    width: 24,
    height: 24,
    borderRadius: '50%',
    border: '1px solid rgba(0,0,0,0.15)',
    cursor: 'pointer',
    padding: 0,
  },
  objectCount: {
    fontSize: 11,
    color: '#888',
    fontWeight: 500,
    whiteSpace: 'nowrap',
  },
  objectCountAtLimit: {
    color: '#c62828',
    fontWeight: 700,
  },
};
