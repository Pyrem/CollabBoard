import { Canvas as FabricCanvas, ActiveSelection } from 'fabric';
import type { RefObject, MutableRefObject } from 'react';
import type { useBoard } from '../../../hooks/useBoard.js';
import type { SelectedObject, EditingState } from '../Canvas.js';
import { getBoardId } from './fabricHelpers.js';

/**
 * Attach selection tracking (selection:created/updated/cleared) and
 * keyboard delete (Delete/Backspace) listeners.
 * Returns a cleanup function.
 */
export function attachSelectionManager(
  canvas: FabricCanvas,
  boardRef: RefObject<ReturnType<typeof useBoard>>,
  onSelectionChangeRef: RefObject<(selected: SelectedObject | null) => void>,
  editingStickyRef: MutableRefObject<EditingState | null>,
): () => void {
  const notifySelection = (): void => {
    const active = canvas.getActiveObject();
    if (active) {
      const id = getBoardId(active);
      if (id) {
        const data = boardRef.current.getObject(id);
        onSelectionChangeRef.current(data ? { id, type: data.type } : null);
        return;
      }
    }
    onSelectionChangeRef.current(null);
  };

  canvas.on('selection:created', notifySelection);
  canvas.on('selection:updated', notifySelection);
  canvas.on('selection:cleared', notifySelection);

  const handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (editingStickyRef.current) return;

    const active = canvas.getActiveObject();
    if (!active) return;

    e.preventDefault();

    if (active instanceof ActiveSelection) {
      // Multi-delete: collect all boardIds from the selection's children
      const ids: string[] = [];
      for (const child of active.getObjects()) {
        const childId = getBoardId(child);
        if (childId) ids.push(childId);
      }
      canvas.discardActiveObject();
      if (ids.length > 0) {
        boardRef.current.batchDeleteObjects(ids);
      }
    } else {
      // Single-delete
      const id = getBoardId(active);
      if (!id) return;
      canvas.discardActiveObject();
      boardRef.current.deleteObject(id);
    }

    onSelectionChangeRef.current(null);
  };

  window.addEventListener('keydown', handleKeyDown);

  return () => {
    canvas.off('selection:created', notifySelection);
    canvas.off('selection:updated', notifySelection);
    canvas.off('selection:cleared', notifySelection);
    window.removeEventListener('keydown', handleKeyDown);
  };
}
