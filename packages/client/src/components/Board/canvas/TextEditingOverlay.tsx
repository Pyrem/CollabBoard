import type { EditingState } from '../Canvas.js';

interface TextEditingOverlayProps {
  editing: EditingState;
  zoom: number;
  onSave: (text: string) => void;
  onCancel: () => void;
}

export function TextEditingOverlay({ editing, zoom, onSave, onCancel }: TextEditingOverlayProps): React.JSX.Element {
  return (
    <textarea
      style={{
        position: 'absolute',
        left: editing.screenX,
        top: editing.screenY,
        width: editing.width,
        height: editing.height,
        fontSize: 16 * zoom,
        fontFamily: 'sans-serif',
        color: '#333',
        backgroundColor: editing.color,
        border: '2px solid #2196F3',
        borderRadius: 4,
        padding: 10,
        resize: 'none',
        outline: 'none',
        zIndex: 200,
        boxSizing: 'border-box',
      }}
      defaultValue={editing.text}
      autoFocus
      onBlur={(e) => onSave(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
    />
  );
}
