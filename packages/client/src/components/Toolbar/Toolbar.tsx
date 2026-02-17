import { useState } from 'react';
import type { useBoard } from '../../hooks/useBoard.js';
import type { SelectedObject } from '../Board/Canvas.js';
import type { BoardObject } from '@collabboard/shared';
import { STICKY_COLORS } from '@collabboard/shared';

interface ToolbarProps {
  board: ReturnType<typeof useBoard>;
  selectedObject: SelectedObject | null;
}

type Tool = 'select' | 'sticky' | 'rectangle';

export function Toolbar({ board, selectedObject }: ToolbarProps): React.JSX.Element {
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [selectedColor, setSelectedColor] = useState<string>(STICKY_COLORS[0]);

  const handleToolClick = (tool: Tool): void => {
    if (tool === 'sticky') {
      board.createStickyNote(
        window.innerWidth / 2 - 100,
        window.innerHeight / 2 - 100,
        '',
        selectedColor,
      );
    } else if (tool === 'rectangle') {
      board.createRectangle(
        window.innerWidth / 2 - 75,
        window.innerHeight / 2 - 50,
        undefined,
        undefined,
        selectedColor,
      );
    }
    setActiveTool(tool);
  };

  const handleColorClick = (color: string): void => {
    setSelectedColor(color);
    // If an object is selected, update its color in-place
    if (selectedObject) {
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
};
