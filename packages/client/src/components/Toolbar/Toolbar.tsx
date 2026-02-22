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

const toolBtnBase =
  'px-3.5 py-1.5 border border-gray-300 rounded-lg bg-white cursor-pointer text-[13px] font-medium hover:bg-gray-50';
const toolBtnActive = 'bg-blue-50 border-blue-500 text-blue-800';

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
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 bg-white rounded-xl shadow-lg px-3 py-2 flex items-center gap-2 z-[100]">
      <button
        className={`${toolBtnBase} ${activeTool === 'select' ? toolBtnActive : ''}`}
        onClick={() => onToolChange('select')}
        title="Select (V)"
      >
        Select
      </button>
      <button
        className={`${toolBtnBase} ${activeTool === 'sticky' ? toolBtnActive : ''}`}
        onClick={() => handleToolClick('sticky')}
        title="Sticky Note (S)"
      >
        Sticky
      </button>
      <button
        className={`${toolBtnBase} ${activeTool === 'rectangle' ? toolBtnActive : ''}`}
        onClick={() => handleToolClick('rectangle')}
        title="Rectangle (R)"
      >
        Rect
      </button>
      <button
        className={`${toolBtnBase} ${activeTool === 'text' ? toolBtnActive : ''}`}
        onClick={() => handleToolClick('text')}
        title="Text (T)"
      >
        Text
      </button>
      <button
        className={`${toolBtnBase} ${activeTool === 'frame' ? toolBtnActive : ''}`}
        onClick={() => handleToolClick('frame')}
        title="Frame (F)"
      >
        Frame
      </button>
      <button
        className={`${toolBtnBase} ${activeTool === 'connector' ? toolBtnActive : ''}`}
        onClick={() => handleToolClick('connector')}
        title="Connector (C)"
      >
        Connect
      </button>

      <div className="w-px h-6 bg-gray-300 mx-1" />

      <button
        className="px-3.5 py-1.5 border border-red-300 rounded-lg bg-white text-red-800 cursor-pointer text-[13px] font-medium hover:bg-red-50"
        onClick={() => {
          if (window.confirm('Clear all objects from the board?')) {
            board.clearAll();
          }
        }}
        title="Clear Board"
      >
        Clear
      </button>

      <div className="w-px h-6 bg-gray-300 mx-1" />

      {STICKY_COLORS.map((color) => (
        <button
          key={color}
          className={`w-6 h-6 rounded-full border border-black/15 cursor-pointer p-0 ${
            selectedColor === color ? 'outline-2 outline-gray-700 outline-offset-2' : ''
          }`}
          style={{ backgroundColor: color }}
          onClick={() => handleColorClick(color)}
          title={color}
        />
      ))}

      {selectedObject?.type === 'text' && (
        <>
          <div className="w-px h-6 bg-gray-300 mx-1" />
          {FONT_SIZES.map((size) => (
            <button
              key={size}
              className="px-2 py-1 border border-gray-300 rounded-md bg-white cursor-pointer text-[11px] font-medium min-w-[32px] hover:bg-gray-50"
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

      <div className="w-px h-6 bg-gray-300 mx-1" />

      <span
        className={`text-[11px] font-medium whitespace-nowrap ${atLimit ? 'text-red-800 font-bold' : 'text-gray-400'}`}
        title={`${String(objectCount)} / ${String(MAX_OBJECTS_PER_BOARD)} objects`}
      >
        {String(objectCount)}/{String(MAX_OBJECTS_PER_BOARD)}
      </span>
    </div>
  );
}
