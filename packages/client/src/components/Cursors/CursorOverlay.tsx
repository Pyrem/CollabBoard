import type { UserPresence } from '@collabboard/shared';
import type { ViewportState } from '../Board/Canvas.js';

/**
 * Props for the {@link CursorOverlay} component.
 *
 * @property cursors - Remote user presence states (from {@link useCursors}).
 * @property viewport - Current canvas viewport transform (zoom + pan offsets),
 *   used to convert canvas-space cursor positions to screen pixels.
 */
interface CursorOverlayProps {
  cursors: UserPresence[];
  viewport: ViewportState;
}

/**
 * Render remote user cursors as coloured SVG arrow icons with name labels.
 *
 * Each cursor is positioned at `(cursor.x * zoom + panX, cursor.y * zoom + panY)`
 * using absolute positioning inside a full-screen `pointer-events: none` overlay.
 * A CSS `transition` of 50 ms provides smooth interpolation between throttled
 * awareness updates.
 *
 * Users whose `cursor` is `null` (off-canvas) are filtered out via early `return null`.
 */
export function CursorOverlay({ cursors, viewport }: CursorOverlayProps): React.JSX.Element {
  return (
    <div className="absolute inset-0 pointer-events-none z-50">
      {cursors.map((user) => {
        if (!user.cursor) return null;
        const screenX = user.cursor.x * viewport.zoom + viewport.panX;
        const screenY = user.cursor.y * viewport.zoom + viewport.panY;
        return (
          <div
            key={user.userId}
            className="absolute pointer-events-none"
            style={{
              left: screenX,
              top: screenY,
              transition: 'left 0.05s linear, top 0.05s linear',
            }}
          >
            <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
              <path
                d="M0 0L16 12H6L0 20V0Z"
                fill={user.color}
              />
            </svg>
            <span
              className="absolute top-5 left-2.5 text-white text-[11px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap"
              style={{ backgroundColor: user.color }}
            >
              {user.displayName}
            </span>
          </div>
        );
      })}
    </div>
  );
}
