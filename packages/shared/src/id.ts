/**
 * Universal unique ID generator that works in both Node.js and browsers.
 *
 * Uses `crypto.randomUUID()` which is available in Node 19+ and all
 * modern browsers. Both environments expose `crypto` as a global.
 *
 * Every board object, board metadata record, and any other entity that needs
 * a globally unique key should use this single function.
 */

/** UUID v4 regex for validation. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Resolve crypto once at module load — works in Node (globalThis.crypto
// since Node 19) and browsers (window.crypto).  The `as` cast is needed
// because the shared tsconfig doesn't include the DOM lib.
const _crypto = (globalThis as Record<string, unknown>)['crypto'] as
  | { randomUUID?: () => string; getRandomValues?: (buf: Uint8Array) => Uint8Array }
  | undefined;

/**
 * Generate a new UUID v4 string.
 *
 * Portable across Node.js and browser environments.
 */
export function generateId(): string {
  if (typeof _crypto?.randomUUID === 'function') {
    return _crypto.randomUUID();
  }

  // Fallback: manual v4 UUID via getRandomValues
  if (typeof _crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    _crypto.getRandomValues(bytes);
    // Set version (4) and variant (RFC 4122)
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  throw new Error('No cryptographic random source available');
}

/**
 * Validate that a string is a well-formed UUID v4.
 *
 * Useful for route params, API inputs, and test assertions.
 */
export function isValidId(id: string): boolean {
  return UUID_RE.test(id);
}
