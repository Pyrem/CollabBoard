import { useRef, useState } from 'react';
import type { useBoard } from '../../hooks/useBoard.js';
import type { SelectedObject } from '../Board/Canvas.js';
import type { BoardObject } from '@collabboard/shared';
import { STICKY_COLORS, MAX_OBJECTS_PER_BOARD, THROTTLE } from '@collabboard/shared';

interface ToolbarProps {
  board: ReturnType<typeof useBoard>;
  selectedObject: SelectedObject | null;
  activeTool: string;
  onToolChange: (tool: string) => void;
  getSceneCenter: () => { x: number; y: number };
}

type Tool = 'select' | 'sticky' | 'rectangle' | 'text' | 'frame' | 'connector';

const FONT_SIZES = [14, 20, 28, 36, 48] as const;

export function Toolbar({ board, selectedObject, activeTool, onToolChange, getSceneCenter }: ToolbarProps): React.JSX.Element {
  const [selectedColor, setSelectedColor] = useState<string>(STICKY_COLORS[0]);
  const lastColorChangeRef = useRef(0);

  const objectCount = board.getObjectCount();
  const atLimit = objectCount >= MAX_OBJECTS_PER_BOARD;

  const handleToolClick = (tool: Tool): void => {
    // Connector tool is modal — don't create anything on click, just activate
    if (tool === 'connector') {
      onToolChange('connector');
      return;
    }

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
    } else if (tool === 'text') {
      result = board.createText(
        center.x - 100,
        center.y - 15,
        'Type here',
        undefined,
        selectedColor === STICKY_COLORS[0] ? undefined : selectedColor,
      );
    } else if (tool === 'frame') {
      result = board.createFrame(
        center.x - 200,
        center.y - 150,
      );
    }
    if (result === null && tool !== 'select') {
      window.alert(`Object limit reached (${String(MAX_OBJECTS_PER_BOARD)}). Delete some objects before creating new ones.`);
      return;
    }
    onToolChange(tool);
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
      } else if (selectedObject.type === 'text') {
        board.updateObject(selectedObject.id, { fill: color } as Partial<BoardObject>);
      } else if (selectedObject.type === 'frame') {
        board.updateObject(selectedObject.id, { fill: color } as Partial<BoardObject>);
      } else if (selectedObject.type === 'connector') {
        board.updateObject(selectedObject.id, { stroke: color } as Partial<BoardObject>);
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
        onClick={() => onToolChange('select')}
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
      <button
        style={{
          ...styles.toolBtn,
          ...(activeTool === 'text' ? styles.active : {}),
        }}
        onClick={() => handleToolClick('text')}
        title="Text (T)"
      >
        Text
      </button>
      <button
        style={{
          ...styles.toolBtn,
          ...(activeTool === 'frame' ? styles.active : {}),
        }}
        onClick={() => handleToolClick('frame')}
        title="Frame (F)"
      >
        Frame
      </button>
      <button
        style={{
          ...styles.toolBtn,
          ...(activeTool === 'connector' ? styles.active : {}),
        }}
        onClick={() => handleToolClick('connector')}
        title="Connector (C)"
      >
        Connect
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

      {selectedObject?.type === 'text' && (
        <>
          <div style={styles.separator} />
          {FONT_SIZES.map((size) => (
            <button
              key={size}
              style={styles.fontSizeBtn}
              onClick={() => {
                board.updateObject(selectedObject.id, { fontSize: size } as Partial<BoardObject>);
              }}
              title={`Font size ${String(size)}`}
            >
              {String(size)}
            </button>
          ))}
        </>
      )}

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
  fontSizeBtn: {
    padding: '4px 8px',
    border: '1px solid #ddd',
    borderRadius: 6,
    backgroundColor: '#fff',
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 500,
    minWidth: 32,
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
