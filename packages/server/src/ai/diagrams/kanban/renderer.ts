// ─── Kanban deterministic renderer ──────────────────────────────────
//
// Converts a validated KanbanPlanV1 into board objects by calling
// executeTool against the live Yjs document. All mutations are wrapped
// in a single doc.transact() so connected clients see one atomic update.

import type { KanbanPlanV1, KanbanColumn } from '@collabboard/shared';
import { KANBAN_LAYOUT, KANBAN_COLUMN_COLORS } from '@collabboard/shared';
import type { StickyColor } from '@collabboard/shared';
import type { ToolResult } from '../../executor.js';
import { executeTool } from '../../executor.js';
import type { RenderContext } from '../types.js';

/**
 * Compute the required frame height for a given number of cards.
 *
 * Cards stack vertically (one per row). Returns at least
 * {@link KANBAN_LAYOUT.MIN_COLUMN_HEIGHT}.
 */
function computeColumnHeight(cardCount: number): number {
  if (cardCount === 0) return KANBAN_LAYOUT.MIN_COLUMN_HEIGHT;
  const needed =
    KANBAN_LAYOUT.FRAME_TITLE_OFFSET +
    cardCount * (KANBAN_LAYOUT.STICKY_SIZE + KANBAN_LAYOUT.GAP) -
    KANBAN_LAYOUT.GAP +
    KANBAN_LAYOUT.FRAME_PAD;
  return Math.max(KANBAN_LAYOUT.MIN_COLUMN_HEIGHT, needed);
}

/**
 * Get the default colour for a column by its index, cycling through
 * {@link KANBAN_COLUMN_COLORS}.
 */
function defaultColorForColumn(index: number): StickyColor {
  return KANBAN_COLUMN_COLORS[index % KANBAN_COLUMN_COLORS.length]!;
}

/**
 * Render a validated {@link KanbanPlanV1} onto the board.
 *
 * Creates:
 *   1. A title text element centered above the columns.
 *   2. One frame per column, arranged horizontally.
 *   3. Sticky notes stacked vertically inside each column.
 *
 * All columns share the tallest column's height for visual consistency.
 *
 * @returns A {@link ToolResult} summarising what was created, with
 *   `data.createdIds` listing every created object's UUID.
 */
export function renderKanban(plan: KanbanPlanV1, ctx: RenderContext): ToolResult {
  const { doc, userId, viewportCenter } = ctx;
  const { x: cx, y: cy } = viewportCenter;
  const numCols = plan.columns.length;

  // ── Uniform column height (max across all columns) ─────────────
  const columnH = Math.max(
    ...plan.columns.map((col: KanbanColumn) => computeColumnHeight(col.cards.length)),
  );

  // ── Board bounding box ─────────────────────────────────────────
  const boardW =
    numCols * KANBAN_LAYOUT.COLUMN_WIDTH +
    (numCols - 1) * KANBAN_LAYOUT.COLUMN_GAP;
  const boardH = KANBAN_LAYOUT.TITLE_GAP + columnH;
  const originX = cx - boardW / 2;
  const originY = cy - boardH / 2;

  const createdIds: string[] = [];
  const errors: string[] = [];

  // ── Wrap in a single Yjs transaction for atomic update ─────────
  doc.transact(() => {
    // 1. Title
    const titleResult = executeTool(
      'createText',
      { text: plan.title, x: originX, y: originY, fontSize: KANBAN_LAYOUT.TITLE_FONT_SIZE },
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
      const colX = originX + ci * (KANBAN_LAYOUT.COLUMN_WIDTH + KANBAN_LAYOUT.COLUMN_GAP);
      const colY = originY + KANBAN_LAYOUT.TITLE_GAP;
      const colColor = col.color ?? defaultColorForColumn(ci);

      // Create column frame
      const frameResult = executeTool(
        'createFrame',
        { title: col.title, x: colX, y: colY, width: KANBAN_LAYOUT.COLUMN_WIDTH, height: columnH },
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
      const innerX = colX + KANBAN_LAYOUT.FRAME_PAD;
      const innerY = colY + KANBAN_LAYOUT.FRAME_TITLE_OFFSET;

      for (const [ci2, card] of col.cards.entries()) {
        const cardY = innerY + ci2 * (KANBAN_LAYOUT.STICKY_SIZE + KANBAN_LAYOUT.GAP);

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
      message: `Kanban board partially created with errors: ${errors.join('; ')}`,
      data: { createdIds, errors },
    };
  }

  return {
    success: true,
    message: `Created Kanban board "${plan.title}" with ${String(numCols)} columns and ${String(totalCards)} cards`,
    data: { createdIds },
  };
}
