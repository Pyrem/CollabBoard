import { useEffect, useRef } from 'react';
import type { Canvas as FabricCanvas } from 'fabric';
import type * as Y from 'yjs';
import { uploadThumbnail } from '../lib/api.js';

/** Thumbnail output width (16:9 aspect ratio). */
const THUMB_WIDTH = 480;
const THUMB_HEIGHT = 270;

/** How long to wait after the last Yjs change before capturing (ms). */
const DEBOUNCE_MS = 30_000;

/**
 * Convert a data-URL string to a Blob.
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mime = header?.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
  const binary = atob(base64 ?? '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

/**
 * Compute the bounding box of all objects on a Fabric canvas.
 * Returns null if the canvas has no objects.
 */
function getContentBounds(canvas: FabricCanvas): { left: number; top: number; width: number; height: number } | null {
  const objects = canvas.getObjects();
  if (objects.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const obj of objects) {
    const bound = obj.getBoundingRect();
    // getBoundingRect returns screen coords — convert to canvas coords
    const vpt = canvas.viewportTransform;
    if (!vpt) continue;
    const zoom = canvas.getZoom();
    const left = (bound.left - vpt[4]) / zoom;
    const top = (bound.top - vpt[5]) / zoom;
    const right = left + bound.width / zoom;
    const bottom = top + bound.height / zoom;

    if (left < minX) minX = left;
    if (top < minY) minY = top;
    if (right > maxX) maxX = right;
    if (bottom > maxY) maxY = bottom;
  }

  if (!isFinite(minX)) return null;

  return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Capture a JPEG thumbnail of the board content.
 *
 * Computes the bounding box of all objects, centers a virtual 1920x1080
 * viewport on it, and renders a scaled-down 480x270 JPEG.
 */
function captureSnapshot(canvas: FabricCanvas): Blob | null {
  const bounds = getContentBounds(canvas);
  if (!bounds) return null;

  // Save original viewport state
  const origVpt = [...canvas.viewportTransform!] as [number, number, number, number, number, number];
  const origWidth = canvas.getWidth();
  const origHeight = canvas.getHeight();

  // Compute the virtual viewport: fit content into 1920x1080 with padding
  const padding = 100;
  const contentW = bounds.width + padding * 2;
  const contentH = bounds.height + padding * 2;
  const scaleX = 1920 / contentW;
  const scaleY = 1080 / contentH;
  const fitZoom = Math.min(scaleX, scaleY, 2); // cap at 2x to avoid over-zooming small boards

  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;

  // Set canvas to 1920x1080 for capture
  canvas.setDimensions({ width: 1920, height: 1080 });
  canvas.setViewportTransform([
    fitZoom, 0, 0, fitZoom,
    960 - centerX * fitZoom,
    540 - centerY * fitZoom,
  ]);
  canvas.renderAll();

  // Capture as JPEG scaled down to thumbnail size
  const dataUrl = canvas.toDataURL({
    format: 'jpeg',
    quality: 0.7,
    multiplier: THUMB_WIDTH / 1920,
  });

  // Restore original state
  canvas.setDimensions({ width: origWidth, height: origHeight });
  canvas.setViewportTransform(origVpt);
  canvas.renderAll();

  return dataUrlToBlob(dataUrl);
}

/**
 * Hook that periodically captures a thumbnail of the board and uploads it.
 *
 * Listens to Yjs map changes and debounces capture to 30 seconds after
 * the last change. Also does a best-effort capture on component unmount.
 *
 * @param fabricRef - Ref to the Fabric canvas instance (may be null before init).
 * @param boardId - The board's unique identifier.
 * @param objectsMap - The Yjs shared map of board objects.
 */
export function useThumbnailCapture(
  fabricRef: React.RefObject<FabricCanvas | null>,
  boardId: string,
  objectsMap: Y.Map<unknown> | null,
): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasChangedRef = useRef(false);

  useEffect(() => {
    if (!objectsMap) return;

    const doCapture = (): void => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      hasChangedRef.current = false;

      const blob = captureSnapshot(canvas);
      if (!blob) return;

      // Fire-and-forget upload
      uploadThumbnail(boardId, blob).catch(() => {
        // Silently ignore upload failures — thumbnails are best-effort
      });
    };

    const observer = (): void => {
      hasChangedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(doCapture, DEBOUNCE_MS);
    };

    objectsMap.observe(observer);

    return () => {
      objectsMap.unobserve(observer);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      // Best-effort capture on unmount
      if (hasChangedRef.current) {
        doCapture();
      }
    };
  }, [fabricRef, boardId, objectsMap]);
}
