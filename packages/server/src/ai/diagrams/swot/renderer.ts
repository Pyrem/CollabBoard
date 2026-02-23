// ─── SWOT deterministic renderer ────────────────────────────────────
//
// Converts a validated SWOTPlanV1 into board objects by calling
// executeTool against the live Yjs document. All mutations are wrapped
// in a single doc.transact() so connected clients see one atomic update.

import type { SWOTPlanV1, SWOTSticky, StickyColor } from '@collabboard/shared';
import { SWOT_LAYOUT, SWOT_DEFAULT_COLORS } from '@collabboard/shared';
import type { ToolResult } from '../../executor.js';
import { executeTool } from '../../executor.js';
import type { RenderContext } from '../types.js';

interface Quadrant {
  key: string;
  title: string;
  stickies: SWOTSticky[];
  defaultColor: StickyColor;
}

/**
 * Compute the number of sticky columns that fit inside a frame.
 *
 * Uses the frame's usable width (after padding) and the fixed sticky
 * size + gap to determine how many columns fit.
 */
function computeColumns(): number {
  const usableW = SWOT_LAYOUT.QUAD_WIDTH - 2 * SWOT_LAYOUT.FRAME_PAD;
  return Math.max(1, Math.floor((usableW + SWOT_LAYOUT.GAP) / (SWOT_LAYOUT.STICKY_SIZE + SWOT_LAYOUT.GAP)));
}

/**
 * Compute the required frame height for a given number of stickies.
 *
 * Returns at least {@link SWOT_LAYOUT.QUAD_HEIGHT} so frames never
 * shrink below the minimum.
 */
function computeQuadHeight(stickyCount: number, columns: number): number {
  if (stickyCount === 0) return SWOT_LAYOUT.QUAD_HEIGHT;
  const rows = Math.ceil(stickyCount / columns);
  const needed =
    SWOT_LAYOUT.FRAME_TITLE_OFFSET +
    rows * (SWOT_LAYOUT.STICKY_SIZE + SWOT_LAYOUT.GAP) -
    SWOT_LAYOUT.GAP +
    SWOT_LAYOUT.FRAME_PAD;
  return Math.max(SWOT_LAYOUT.QUAD_HEIGHT, needed);
}

/**
 * Render a validated {@link SWOTPlanV1} onto the board.
 *
 * Creates:
 *   1. A title text element centered above the grid.
 *   2. Four frames in a 2×2 grid (Strengths, Weaknesses, Opportunities, Threats).
 *   3. Sticky notes packed in a grid inside each frame.
 *
 * Frame heights auto-grow per row to accommodate many stickies. Both
 * frames in the same row share the taller height for visual consistency.
 *
 * @returns A {@link ToolResult} summarising what was created, with
 *   `data.createdIds` listing every created object's UUID.
 */
export function renderSwot(plan: SWOTPlanV1, ctx: RenderContext): ToolResult {
  const { doc, userId, viewportCenter } = ctx;
  const { x: cx, y: cy } = viewportCenter;

  // ── Quadrant definitions (TL, TR, BL, BR) ──────────────────────
  const quadrants: Quadrant[] = [
    { key: 'strengths', title: 'Strengths', stickies: plan.strengths, defaultColor: SWOT_DEFAULT_COLORS['strengths'] as StickyColor },
    { key: 'weaknesses', title: 'Weaknesses', stickies: plan.weaknesses, defaultColor: SWOT_DEFAULT_COLORS['weaknesses'] as StickyColor },
    { key: 'opportunities', title: 'Opportunities', stickies: plan.opportunities, defaultColor: SWOT_DEFAULT_COLORS['opportunities'] as StickyColor },
    { key: 'threats', title: 'Threats', stickies: plan.threats, defaultColor: SWOT_DEFAULT_COLORS['threats'] as StickyColor },
  ];

  const columns = computeColumns();

  // ── Per-row frame heights ──────────────────────────────────────
  const topRowH = Math.max(
    computeQuadHeight(plan.strengths.length, columns),
    computeQuadHeight(plan.weaknesses.length, columns),
  );
  const bottomRowH = Math.max(
    computeQuadHeight(plan.opportunities.length, columns),
    computeQuadHeight(plan.threats.length, columns),
  );

  // ── Board bounding box ─────────────────────────────────────────
  const boardW = 2 * SWOT_LAYOUT.QUAD_WIDTH + SWOT_LAYOUT.QUAD_GAP;
  const boardH = SWOT_LAYOUT.TITLE_GAP + topRowH + SWOT_LAYOUT.QUAD_GAP + bottomRowH;
  const originX = cx - boardW / 2;
  const originY = cy - boardH / 2;

  // ── Quadrant frame positions ───────────────────────────────────
  const positions = [
    { x: originX, y: originY + SWOT_LAYOUT.TITLE_GAP, h: topRowH },
    { x: originX + SWOT_LAYOUT.QUAD_WIDTH + SWOT_LAYOUT.QUAD_GAP, y: originY + SWOT_LAYOUT.TITLE_GAP, h: topRowH },
    { x: originX, y: originY + SWOT_LAYOUT.TITLE_GAP + topRowH + SWOT_LAYOUT.QUAD_GAP, h: bottomRowH },
    { x: originX + SWOT_LAYOUT.QUAD_WIDTH + SWOT_LAYOUT.QUAD_GAP, y: originY + SWOT_LAYOUT.TITLE_GAP + topRowH + SWOT_LAYOUT.QUAD_GAP, h: bottomRowH },
  ];

  const createdIds: string[] = [];
  const errors: string[] = [];

  // ── Wrap in a single Yjs transaction for atomic update ─────────
  doc.transact(() => {
    // 1. Title
    const titleResult = executeTool(
      'createText',
      { text: plan.title, x: originX, y: originY, fontSize: SWOT_LAYOUT.TITLE_FONT_SIZE },
      doc,
      userId,
    );
    if (titleResult.success) {
      createdIds.push((titleResult.data as { id: string }).id);
    } else {
      errors.push(`Title: ${titleResult.message}`);
    }

    // 2. Frames + stickies
    for (const [qi, q] of quadrants.entries()) {
      const pos = positions[qi]!;

      // Create frame
      const frameResult = executeTool(
        'createFrame',
        { title: q.title, x: pos.x, y: pos.y, width: SWOT_LAYOUT.QUAD_WIDTH, height: pos.h },
        doc,
        userId,
      );
      if (frameResult.success) {
        createdIds.push((frameResult.data as { id: string }).id);
      } else {
        errors.push(`Frame ${q.title}: ${frameResult.message}`);
        continue; // skip stickies if frame failed
      }

      // Pack stickies in a grid inside the frame
      const innerX = pos.x + SWOT_LAYOUT.FRAME_PAD;
      const innerY = pos.y + SWOT_LAYOUT.FRAME_TITLE_OFFSET;

      for (const [si, sticky] of q.stickies.entries()) {
        const col = si % columns;
        const row = Math.floor(si / columns);
        const sx = innerX + col * (SWOT_LAYOUT.STICKY_SIZE + SWOT_LAYOUT.GAP);
        const sy = innerY + row * (SWOT_LAYOUT.STICKY_SIZE + SWOT_LAYOUT.GAP);

        const stickyResult = executeTool(
          'createStickyNote',
          { text: sticky.text, x: sx, y: sy, color: sticky.color ?? q.defaultColor },
          doc,
          userId,
        );
        if (stickyResult.success) {
          createdIds.push((stickyResult.data as { id: string }).id);
        } else {
          errors.push(`Sticky in ${q.title}: ${stickyResult.message}`);
        }
      }
    }
  });

  // ── Result ─────────────────────────────────────────────────────
  const totalStickies = quadrants.reduce((sum, q) => sum + q.stickies.length, 0);

  if (errors.length > 0) {
    return {
      success: false,
      message: `SWOT diagram partially created with errors: ${errors.join('; ')}`,
      data: { createdIds, errors },
    };
  }

  return {
    success: true,
    message: `Created SWOT diagram "${plan.title}" with 4 frames and ${String(totalStickies)} sticky notes`,
    data: { createdIds },
  };
}
