import {
  Canvas as FabricCanvas,
  ActiveSelection,
  type TPointerEvent,
  type TPointerEventInfo,
} from 'fabric';
import type { RefObject } from 'react';
import type { CursorPosition } from '@collabboard/shared';
import type { ViewportState } from '../Canvas.js';

/**
 * Attach pan (alt/middle-click drag) and zoom (scroll wheel) listeners.
 * Returns a cleanup function that removes all listeners.
 */
export function attachPanZoom(
  canvas: FabricCanvas,
  onCursorMoveRef: RefObject<(pos: CursorPosition, heavy?: boolean) => void>,
  onViewportChangeRef: RefObject<(vp: ViewportState) => void>,
): () => void {
  let isPanning = false;
  let lastPosX = 0;
  let lastPosY = 0;

  const emitViewport = (): void => {
    const vpt = canvas.viewportTransform;
    if (!vpt) return;
    onViewportChangeRef.current({ zoom: canvas.getZoom(), panX: vpt[4], panY: vpt[5] });
  };

  const onMouseDown = (opt: TPointerEventInfo<TPointerEvent>): void => {
    const evt = opt.e as MouseEvent;
    if (evt.altKey || evt.button === 1) {
      isPanning = true;
      lastPosX = evt.clientX;
      lastPosY = evt.clientY;
      canvas.selection = false;
    }
  };

  const onMouseMove = (opt: TPointerEventInfo<TPointerEvent>): void => {
    const evt = opt.e as MouseEvent;
    const pointer = canvas.getScenePoint(evt);
    const heavy = canvas.getActiveObject() instanceof ActiveSelection;
    onCursorMoveRef.current({ x: pointer.x, y: pointer.y }, heavy);

    if (isPanning) {
      const dx = evt.clientX - lastPosX;
      const dy = evt.clientY - lastPosY;
      const vpt = canvas.viewportTransform;
      if (vpt) {
        vpt[4] += dx;
        vpt[5] += dy;
        canvas.setViewportTransform(vpt);
        emitViewport();
      }
      lastPosX = evt.clientX;
      lastPosY = evt.clientY;
    }
  };

  const onMouseUp = (): void => {
    isPanning = false;
    canvas.selection = true;
  };

  const onWheel = (opt: TPointerEventInfo<WheelEvent>): void => {
    const delta = opt.e.deltaY;
    let zoom = canvas.getZoom();
    zoom *= 0.999 ** delta;
    zoom = Math.min(Math.max(zoom, 0.1), 5);
    canvas.zoomToPoint(canvas.getScenePoint(opt.e), zoom);
    emitViewport();
    opt.e.preventDefault();
    opt.e.stopPropagation();
  };

  canvas.on('mouse:down', onMouseDown);
  canvas.on('mouse:move', onMouseMove);
  canvas.on('mouse:up', onMouseUp);
  canvas.on('mouse:wheel', onWheel);

  return () => {
    canvas.off('mouse:down', onMouseDown);
    canvas.off('mouse:move', onMouseMove);
    canvas.off('mouse:up', onMouseUp);
    canvas.off('mouse:wheel', onWheel);
  };
}
