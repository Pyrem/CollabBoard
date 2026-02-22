import type { onChangePayload } from '@hocuspocus/server';
import { MAX_OBJECTS_PER_BOARD } from '@collabboard/shared';

/**
 * Hocuspocus `onChange` hook — invoked after every Yjs document update.
 *
 * Reads the `objects` Y.Map from the document and checks its size against
 * {@link MAX_OBJECTS_PER_BOARD}. When the limit is exceeded a warning is
 * logged with the board name and current count. No mutations are performed;
 * the hook is purely observational.
 *
 * @param payload - Hocuspocus change payload containing the Yjs `document`
 *   and the `documentName` (board identifier).
 * @returns Resolves immediately after the check completes.
 *
 * @example
 * // Registered in the Hocuspocus server configuration:
 * const server = Server.configure({ onChange });
 *
 * @see {@link MAX_OBJECTS_PER_BOARD} for the current object-count threshold.
 */
export async function onChange({ document, documentName }: onChangePayload): Promise<void> {
  const objectsMap = document.getMap('objects');
  const count = objectsMap.size;

  if (count > MAX_OBJECTS_PER_BOARD) {
    console.warn(
      `[LIMIT] Board "${documentName}" has ${String(count)} objects, exceeding limit of ${String(MAX_OBJECTS_PER_BOARD)}.`,
    );
  }
}
