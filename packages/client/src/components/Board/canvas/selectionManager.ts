import { Canvas as FabricCanvas, ActiveSelection } from 'fabric';
import type { RefObject, MutableRefObject } from 'react';
import type { BoardObject, Connector, Frame } from '@collabboard/shared';
import { logger } from '@collabboard/shared';
import type { useBoard } from '../../../hooks/useBoard.js';
import type { SelectedObject, EditingState } from '../Canvas.js';
import { getBoardId } from './fabricHelpers.js';

const log = logger('selection');

/** Extract loggable details from a board object. */
function describeObject(obj: BoardObject): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: obj.id,
    type: obj.type,
    x: obj.x,
    y: obj.y,
  };
  switch (obj.type) {
    case 'sticky':
      base.text = obj.text;
      base.color = obj.color;
      break;
    case 'rectangle':
    case 'circle':
      base.fill = obj.fill;
      base.stroke = obj.stroke;
      base.width = obj.width;
      base.height = obj.height;
      break;
    case 'line':
      base.stroke = obj.stroke;
      base.x2 = obj.x2;
      base.y2 = obj.y2;
      break;
    case 'text':
      base.text = obj.text;
      base.fill = obj.fill;
      base.fontSize = obj.fontSize;
      break;
    case 'frame':
      base.title = obj.title;
      base.fill = obj.fill;
      break;
    case 'connector':
      base.fromId = obj.fromId;
      base.toId = obj.toId;
      base.stroke = obj.stroke;
      break;
  }
  return base;
}

/**
 * Find and delete all connectors that reference any of the given object IDs.
 * Scans the board for connectors whose `fromId` or `toId` is in `deletedIds`.
 */
function cascadeDeleteConnectors(
  board: ReturnType<typeof useBoard>,
  deletedIds: Set<string>,
): void {
  const connectorIds: string[] = [];
  for (const obj of board.getAllObjects()) {
    if (obj.type !== 'connector') continue;
    const conn = obj as Connector;
    if (deletedIds.has(conn.fromId) || deletedIds.has(conn.toId)) {
      connectorIds.push(conn.id);
    }
  }
  if (connectorIds.length > 0) {
    log.debug('cascade-delete connectors', { count: connectorIds.length, ids: connectorIds });
    board.batchDeleteObjects(connectorIds);
  }
}

/**
 * Clean up frame-child relationships before deleting objects.
 *
 * - If deleting a frame: unparent all its children (don't delete them).
 * - If deleting a child that has a parentId: remove it from the parent frame's childrenIds.
 */
function cleanupFrameRelationships(
  board: ReturnType<typeof useBoard>,
  deletedIds: Set<string>,
): void {
  for (const id of deletedIds) {
    const obj = board.getObject(id);
    if (!obj) continue;

    if (obj.type === 'frame') {
      // Unparent all children of this frame
      const frame = obj as Frame;
      for (const childId of frame.childrenIds) {
        if (deletedIds.has(childId)) continue; // child is also being deleted
        board.removeFromFrame(childId, id);
      }
    } else if (obj.parentId) {
      // Remove this child from its parent frame's childrenIds
      if (!deletedIds.has(obj.parentId)) {
        board.removeFromFrame(id, obj.parentId);
      }
    }
  }
}

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

    // Don't delete a text element while it's being edited inline
    if ('isEditing' in active && (active as unknown as { isEditing: boolean }).isEditing) return;

    e.preventDefault();

    if (active instanceof ActiveSelection) {
      // Multi-delete: collect all boardIds from the selection's children
      const ids: string[] = [];
      const details: Array<Record<string, unknown>> = [];
      for (const child of active.getObjects()) {
        const childId = getBoardId(child);
        if (childId) {
          ids.push(childId);
          const data = boardRef.current.getObject(childId);
          details.push(data ? describeObject(data) : { id: childId, type: 'unknown' });
        }
      }
      canvas.discardActiveObject();
      if (ids.length > 0) {
        log.debug('multi-delete', { count: ids.length, objects: details });
        cleanupFrameRelationships(boardRef.current, new Set(ids));
        cascadeDeleteConnectors(boardRef.current, new Set(ids));
        boardRef.current.batchDeleteObjects(ids);
      }
    } else {
      // Single-delete
      const id = getBoardId(active);
      if (!id) return;
      const data = boardRef.current.getObject(id);
      const detail = data ? describeObject(data) : { id, type: 'unknown' };
      canvas.discardActiveObject();
      log.debug('single-delete', detail);
      cleanupFrameRelationships(boardRef.current, new Set([id]));
      cascadeDeleteConnectors(boardRef.current, new Set([id]));
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
