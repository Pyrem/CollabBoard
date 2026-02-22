import { Canvas as FabricCanvas, ActiveSelection } from 'fabric';
import type { RefObject, MutableRefObject } from 'react';
import type { BoardObject, Connector, Frame } from '@collabboard/shared';
import { logger } from '@collabboard/shared';
import type { useBoard } from '../../../hooks/useBoard.js';
import type { SelectedObject, EditingState } from '../Canvas.js';
import { getBoardId } from './fabricHelpers.js';

const log = logger('selection');

/**
 * Extract a loggable subset of fields from a board object.
 *
 * Includes common fields (`id`, `type`, `x`, `y`) plus type-specific fields
 * (e.g. `text`/`color` for stickies, `fill`/`stroke` for shapes). Used by
 * the selection logger for delete and selection events.
 *
 * @param obj - The validated board object.
 * @returns A plain record suitable for structured logging.
 */
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
      base.startId = obj.start.id;
      base.endId = obj.end.id;
      base.stroke = obj.stroke;
      break;
  }
  return base;
}

/**
 * Cascade-delete connectors attached to any of the objects being deleted.
 *
 * Scans all board objects for connectors whose `start.id` or `end.id` is in
 * `deletedIds`, then removes them in a single batch. This prevents orphaned
 * connector lines from persisting in the Yjs document.
 *
 * @param board - The {@link useBoard} return value (provides `getAllObjects`, `batchDeleteObjects`).
 * @param deletedIds - Set of object UUIDs about to be deleted.
 */
function cascadeDeleteConnectors(
  board: ReturnType<typeof useBoard>,
  deletedIds: Set<string>,
): void {
  const connectorIds: string[] = [];
  for (const obj of board.getAllObjects()) {
    if (obj.type !== 'connector') continue;
    const conn = obj as Connector;
    if (deletedIds.has(conn.start.id) || deletedIds.has(conn.end.id)) {
      connectorIds.push(conn.id);
    }
  }
  if (connectorIds.length > 0) {
    log.debug('cascade-delete connectors', { count: connectorIds.length, ids: connectorIds });
    board.batchDeleteObjects(connectorIds);
  }
}

/**
 * Clean up frame ↔ child relationships before deleting objects.
 *
 * Two cases:
 * 1. **Deleting a frame** — unparents all its children (sets their `parentId`
 *    to `null` and removes from `childrenIds`). Children are *not* deleted.
 * 2. **Deleting a child with a `parentId`** — removes the child's ID from the
 *    parent frame's `childrenIds` array.
 *
 * Skips cleanup for objects that are themselves in `deletedIds` (both sides
 * of the relationship are going away).
 *
 * @param board - The {@link useBoard} return value.
 * @param deletedIds - Set of object UUIDs about to be deleted.
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
 * Attach selection tracking and keyboard-delete listeners to a Fabric canvas.
 *
 * **Selection tracking** — listens for `selection:created`, `selection:updated`,
 * and `selection:cleared` and calls `onSelectionChangeRef` with the currently
 * selected object (or `null`). Also enforces the rotation-lock invariant on
 * `ActiveSelection`s that contain at least one frame.
 *
 * **Keyboard delete** — listens for `Delete` and `Backspace` on `window`. When
 * a single object or an `ActiveSelection` is active, the handler:
 * 1. Cleans up frame-child relationships via {@link cleanupFrameRelationships}.
 * 2. Cascade-deletes attached connectors via {@link cascadeDeleteConnectors}.
 * 3. Deletes the object(s) from the Yjs map.
 *
 * Ignores key events when the focus is on `<input>` / `<textarea>` or when a
 * sticky note is being text-edited (checked via `editingStickyRef`).
 *
 * @param canvas - The Fabric canvas to attach listeners to.
 * @param boardRef - Ref to the {@link useBoard} return value.
 * @param onSelectionChangeRef - Ref to the callback that receives the selected object.
 * @param editingStickyRef - Ref to the current sticky-editing state (guards key events).
 * @returns A cleanup function that removes all listeners.
 */
export function attachSelectionManager(
  canvas: FabricCanvas,
  boardRef: RefObject<ReturnType<typeof useBoard>>,
  onSelectionChangeRef: RefObject<(selected: SelectedObject | null) => void>,
  editingStickyRef: MutableRefObject<EditingState | null>,
  onToolChangeRef?: RefObject<(tool: string) => void>,
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

  /** If the ActiveSelection contains a frame, lock rotation and hide the handle. */
  const enforceFrameRotationLock = (): void => {
    const active = canvas.getActiveObject();
    if (!(active instanceof ActiveSelection)) return;
    const hasFrame = active.getObjects().some((child) => {
      const id = getBoardId(child);
      if (!id) return false;
      const data = boardRef.current.getObject(id);
      return data?.type === 'frame';
    });
    if (hasFrame) {
      active.lockRotation = true;
      active.setControlVisible('mtr', false);
    }
  };

  const onSelectionCreatedOrUpdated = (): void => {
    notifySelection();
    enforceFrameRotationLock();
  };

  canvas.on('selection:created', onSelectionCreatedOrUpdated);
  canvas.on('selection:updated', onSelectionCreatedOrUpdated);
  canvas.on('selection:cleared', notifySelection);

  /** Map of single-key shortcuts to tool identifiers. */
  const toolShortcuts: Record<string, string> = {
    v: 'select',
    s: 'sticky',
    r: 'rectangle',
    t: 'text',
    f: 'frame',
    c: 'connector',
  };

  const handleKeyDown = (e: KeyboardEvent): void => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (editingStickyRef.current) return;

    // Don't fire shortcuts when a Fabric text is being edited inline
    const active = canvas.getActiveObject();
    if (active && 'isEditing' in active && (active as unknown as { isEditing: boolean }).isEditing) return;

    // Ignore keys with modifiers (Ctrl+S, Cmd+R, etc.)
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    // Tool-switching shortcuts
    const tool = toolShortcuts[e.key.toLowerCase()];
    if (tool && onToolChangeRef?.current) {
      e.preventDefault();
      onToolChangeRef.current(tool);
      return;
    }

    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    if (!active) return;

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
    canvas.off('selection:created', onSelectionCreatedOrUpdated);
    canvas.off('selection:updated', onSelectionCreatedOrUpdated);
    canvas.off('selection:cleared', notifySelection);
    window.removeEventListener('keydown', handleKeyDown);
  };
}
