import type { onChangePayload } from '@hocuspocus/server';
import { MAX_OBJECTS_PER_BOARD } from '@collabboard/shared';

/**
 * Hocuspocus change hook. Logs a warning when the object count on a
 * board exceeds {@link MAX_OBJECTS_PER_BOARD}.
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
