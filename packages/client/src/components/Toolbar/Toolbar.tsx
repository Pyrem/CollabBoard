import { useRef, useState } from 'react';
import type { useBoard } from '../../hooks/useBoard.js';
import type { SelectedObject } from '../Board/Canvas.js';
import type { BoardObject } from '@collabboard/shared';
import { STICKY_COLORS, MAX_OBJECTS_PER_BOARD, THROTTLE } from '@collabboard/shared';

/**
 * Props for the {@link Toolbar} component.
 *
 * @property board - {@link useBoard} return value — used for object creation and color changes.
 * @property selectedObject - Currently selected board object (or `null`), used to show
 *   context-sensitive controls (colour picker, font-size for text, etc.).
 * @property activeTool - The currently active toolbar tool.
 * @property onToolChange - Callback to switch the active tool.
 * @property getSceneCenter - Returns the canvas-space centre of the viewport,
 *   used to place newly created objects in the visible area.
 */
interface ToolbarProps {
  board: ReturnType<typeof useBoard>;
  selectedObject: SelectedObject | null;
  activeTool: string;
  onToolChange: (tool: string) => void;
  getSceneCenter: () => { x: number; y: number };
}

/** Union of all tool identifiers used by the toolbar buttons. */
type Tool = 'select' | 'sticky' | 'rectangle' | 'circle' | 'text' | 'frame' | 'connector';

/** Available font-size presets for text elements, ordered smallest → largest. */
const FONT_SIZES = [14, 20, 28, 36, 48] as const;

const toolBtnBase =
  'px-3.5 py-1.5 border border-warm-300 rounded-lg bg-warm-50 cursor-pointer text-[13px] font-medium hover:bg-warm-100 text-warm-700';
const toolBtnActive = 'bg-amber-light border-amber-accent text-warm-800';

/**
 * Bottom-anchored toolbar for tool selection, object creation, colour picking,
 * and object count display.
 *
 * **Tool selection row** — buttons for Select, Sticky, Rectangle, Text, Frame,
 * and Connector. Clicking a creation tool immediately creates an object at the
 * viewport centre (except Connector, which enters a two-click modal flow).
 *
 * **Context panel** — when a board object is selected, shows a colour picker
 * (using {@link STICKY_COLORS}) and, for text elements, a font-size selector.
 * Colour changes are throttled to {@link THROTTLE.COLOR_CHANGE_MS}.
 *
 * **Object count** — displays `n / MAX_OBJECTS_PER_BOARD` and disables creation
 * buttons when the limit is reached.
 */
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
    } else if (tool === 'circle') {
      result = board.createCircle(
        center.x - 50,
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
      } else if (selectedObject.type === 'circle') {
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
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 bg-warm-50 rounded-xl shadow-lg px-3 py-2 flex items-center gap-2 z-[100] border border-warm-200">
      <button
        className={`${toolBtnBase} ${activeTool === 'select' ? toolBtnActive : ''}`}
        onClick={() => onToolChange('select')}
        title="Select"
      >
        Select
      </button>
      <button
        className={`${toolBtnBase} ${activeTool === 'sticky' ? toolBtnActive : ''}`}
        onClick={() => handleToolClick('sticky')}
        title="Sticky Note"
      >
        Sticky
      </button>
      <button
        className={`${toolBtnBase} ${activeTool === 'rectangle' ? toolBtnActive : ''}`}
        onClick={() => handleToolClick('rectangle')}
        title="Rectangle"
      >
        Rect
      </button>
      <button
        className={`${toolBtnBase} ${activeTool === 'circle' ? toolBtnActive : ''}`}
        onClick={() => handleToolClick('circle')}
        title="Circle"
      >
        Circle
      </button>
      <button
        className={`${toolBtnBase} ${activeTool === 'text' ? toolBtnActive : ''}`}
        onClick={() => handleToolClick('text')}
        title="Text"
      >
        Text
      </button>
      <button
        className={`${toolBtnBase} ${activeTool === 'frame' ? toolBtnActive : ''}`}
        onClick={() => handleToolClick('frame')}
        title="Frame"
      >
        Frame
      </button>
      <button
        className={`${toolBtnBase} ${activeTool === 'connector' ? toolBtnActive : ''}`}
        onClick={() => handleToolClick('connector')}
        title="Connector"
      >
        Connect
      </button>

      <div className="w-px h-6 bg-warm-300 mx-1" />

      <button
        className="px-3.5 py-1.5 border border-red-300 rounded-lg bg-warm-50 text-red-800 cursor-pointer text-[13px] font-medium hover:bg-red-50"
        onClick={() => {
          if (window.confirm('Clear all objects from the board?')) {
            board.clearAll();
          }
        }}
        title="Clear Board"
      >
        Clear
      </button>

      <div className="w-px h-6 bg-warm-300 mx-1" />

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
          <div className="w-px h-6 bg-warm-300 mx-1" />
          {FONT_SIZES.map((size) => (
            <button
              key={size}
              className="px-2 py-1 border border-warm-300 rounded-md bg-warm-50 cursor-pointer text-[11px] font-medium min-w-[32px] hover:bg-warm-100 text-warm-700"
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

      <div className="w-px h-6 bg-warm-300 mx-1" />

      <span
        className={`text-[11px] font-medium whitespace-nowrap ${atLimit ? 'text-red-800 font-bold' : 'text-warm-400'}`}
        title={`${String(objectCount)} / ${String(MAX_OBJECTS_PER_BOARD)} objects`}
      >
        {String(objectCount)}/{String(MAX_OBJECTS_PER_BOARD)}
      </span>
    </div>
  );
}
