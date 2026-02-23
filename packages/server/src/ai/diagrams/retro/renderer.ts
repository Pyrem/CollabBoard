// ─── Retrospective deterministic renderer ───────────────────────────
//
// Converts a validated RetroPlanV1 into board objects by calling
// executeTool against the live Yjs document. All mutations are wrapped
// in a single doc.transact() so connected clients see one atomic update.

import type { RetroPlanV1, RetroColumn } from '@collabboard/shared';
import { RETRO_LAYOUT, RETRO_COLUMN_COLORS } from '@collabboard/shared';
import type { StickyColor } from '@collabboard/shared';
import type { ToolResult } from '../../executor.js';
import { executeTool } from '../../executor.js';
import type { RenderContext } from '../types.js';

/**
 * Compute the required frame height for a given number of cards.
 *
 * Cards stack vertically (one per row). Returns at least
 * {@link RETRO_LAYOUT.MIN_COLUMN_HEIGHT}.
 */
function computeColumnHeight(cardCount: number): number {
  if (cardCount === 0) return RETRO_LAYOUT.MIN_COLUMN_HEIGHT;
  const needed =
    RETRO_LAYOUT.FRAME_TITLE_OFFSET +
    cardCount * (RETRO_LAYOUT.STICKY_SIZE + RETRO_LAYOUT.GAP) -
    RETRO_LAYOUT.GAP +
    RETRO_LAYOUT.FRAME_PAD;
  return Math.max(RETRO_LAYOUT.MIN_COLUMN_HEIGHT, needed);
}

/**
 * Get the default colour for a column by its index, cycling through
 * {@link RETRO_COLUMN_COLORS}.
 */
function defaultColorForColumn(index: number): StickyColor {
  return RETRO_COLUMN_COLORS[index % RETRO_COLUMN_COLORS.length]!;
}

/**
 * Render a validated {@link RetroPlanV1} onto the board.
 *
 * Creates:
 *   1. A title text element at the top-left of the diagram.
 *   2. One frame per column, arranged horizontally.
 *   3. Sticky notes stacked vertically inside each column.
 *
 * All columns share the tallest column's height for visual consistency.
 *
 * @returns A {@link ToolResult} summarising what was created, with
 *   `data.createdIds` listing every created object's UUID.
 */
export function renderRetro(plan: RetroPlanV1, ctx: RenderContext): ToolResult {
  const { doc, userId, viewportCenter } = ctx;
  const { x: cx, y: cy } = viewportCenter;
  const numCols = plan.columns.length;

  // ── Uniform column height (max across all columns) ─────────────
  const columnH = Math.max(
    ...plan.columns.map((col: RetroColumn) => computeColumnHeight(col.cards.length)),
  );

  // ── Board bounding box ─────────────────────────────────────────
  const boardW =
    numCols * RETRO_LAYOUT.COLUMN_WIDTH +
    (numCols - 1) * RETRO_LAYOUT.COLUMN_GAP;
  const boardH = RETRO_LAYOUT.TITLE_GAP + columnH;
  const originX = cx - boardW / 2;
  const originY = cy - boardH / 2;

  const createdIds: string[] = [];
  const errors: string[] = [];

  // ── Wrap in a single Yjs transaction for atomic update ─────────
  doc.transact(() => {
    // 1. Title
    const titleResult = executeTool(
      'createText',
      { text: plan.title, x: originX, y: originY, fontSize: RETRO_LAYOUT.TITLE_FONT_SIZE },
      doc,
      userId,
    );
    if (titleResult.success) {
      createdIds.push((titleResult.data as { id: string }).id);
    } else {
      errors.push(`Title: ${titleResult.message}`);
    }

    // 2. Columns + cards
    for (const [ci, col] of plan.columns.entries()) {
      const colX = originX + ci * (RETRO_LAYOUT.COLUMN_WIDTH + RETRO_LAYOUT.COLUMN_GAP);
      const colY = originY + RETRO_LAYOUT.TITLE_GAP;
      const colColor = col.color ?? defaultColorForColumn(ci);

      // Create column frame
      const frameResult = executeTool(
        'createFrame',
        { title: col.title, x: colX, y: colY, width: RETRO_LAYOUT.COLUMN_WIDTH, height: columnH },
        doc,
        userId,
      );
      if (frameResult.success) {
        createdIds.push((frameResult.data as { id: string }).id);
      } else {
        errors.push(`Frame ${col.title}: ${frameResult.message}`);
        continue; // skip cards if frame failed
      }

      // Stack cards vertically inside the column
      const innerX = colX + RETRO_LAYOUT.FRAME_PAD;
      const innerY = colY + RETRO_LAYOUT.FRAME_TITLE_OFFSET;

      for (const [ci2, card] of col.cards.entries()) {
        const cardY = innerY + ci2 * (RETRO_LAYOUT.STICKY_SIZE + RETRO_LAYOUT.GAP);

        const cardResult = executeTool(
          'createStickyNote',
          { text: card.text, x: innerX, y: cardY, color: card.color ?? colColor },
          doc,
          userId,
        );
        if (cardResult.success) {
          createdIds.push((cardResult.data as { id: string }).id);
        } else {
          errors.push(`Card in ${col.title}: ${cardResult.message}`);
        }
      }
    }
  });

  // ── Result ─────────────────────────────────────────────────────
  const totalCards = plan.columns.reduce((sum, col) => sum + col.cards.length, 0);

  if (errors.length > 0) {
    return {
      success: false,
      message: `Retro board partially created with errors: ${errors.join('; ')}`,
      data: { createdIds, errors },
    };
  }

  return {
    success: true,
    message: `Created retro board "${plan.title}" with ${String(numCols)} columns and ${String(totalCards)} cards`,
    data: { createdIds },
  };
}
