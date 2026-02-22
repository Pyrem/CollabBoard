/**
 * Lightweight structured logger for CollabBoard.
 *
 * Usage:
 * ```ts
 * import { logger } from '@collabboard/shared';
 * const log = logger('throttle');
 * log.debug('skipped', { id, elapsed, threshold });
 * ```
 *
 * All levels (including debug) are ON by default.
 *
 * To suppress debug output:
 * - Browser: `localStorage.setItem('collabboard:debug', 'false')`
 * - Node:   `COLLABBOARD_DEBUG=false`
 *
 * To restrict debug to specific namespaces:
 * - Browser: `localStorage.setItem('collabboard:debug', 'throttle,cursor')`
 * - Node:   `COLLABBOARD_DEBUG=throttle,cursor`
 */

/* eslint-disable @typescript-eslint/no-unnecessary-condition */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug: (message: string, data?: Record<string, unknown>) => void;
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
}

// Runtime-only globals — declared here so the shared package compiles without
// DOM or Node type libs.
declare const localStorage: { getItem(key: string): string | null } | undefined;
declare const process: { env: Record<string, string | undefined> } | undefined;
declare const console: {
  log(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
};

/** Read the debug config string from localStorage (browser) or env (Node). */
function getDebugConfig(): string {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      return localStorage.getItem('collabboard:debug') ?? '';
    }
  } catch {
    // localStorage may throw in some contexts (e.g. SSR)
  }
  try {
    if (typeof process !== 'undefined' && process?.env) {
      return process.env['COLLABBOARD_DEBUG'] ?? '';
    }
  } catch {
    // process may not exist
  }
  return '';
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * All levels including debug are ON by default.
 *
 * To suppress debug output, set `localStorage.setItem('collabboard:debug', 'false')`
 * in the browser, or `COLLABBOARD_DEBUG=false` on the server.
 * To restrict to specific namespaces, set e.g. `'throttle,cursor'`.
 */
function isDebugSuppressed(namespace: string): boolean {
  const config = getDebugConfig();
  if (!config) return false; // no config → everything on
  if (config === 'false' || config === '0') return true; // explicitly off
  if (config === 'true' || config === '1' || config === '*') return false; // explicitly on
  // Namespace filter: only listed namespaces get debug output
  const namespaces = config.split(',').map((s) => s.trim());
  return !namespaces.includes(namespace);
}

/** Return `true` if a message at `level` for `namespace` should be emitted. */
function shouldLog(level: LogLevel, namespace: string): boolean {
  // info/warn/error are always on
  if (LEVEL_PRIORITY[level] >= LEVEL_PRIORITY['info']) {
    return true;
  }
  // debug is on by default, but can be suppressed
  return !isDebugSuppressed(namespace);
}

/** Wrap `namespace` in square brackets for log output (e.g. `[sync]`). */
function formatPrefix(namespace: string): string {
  return `[${namespace}]`;
}

/** Create a closure that conditionally logs at the given level and namespace. */
function createLogFn(
  level: LogLevel,
  namespace: string,
  consoleFn: (...args: unknown[]) => void,
): (message: string, data?: Record<string, unknown>) => void {
  return (message: string, data?: Record<string, unknown>): void => {
    if (!shouldLog(level, namespace)) return;
    const prefix = formatPrefix(namespace);
    if (data !== undefined) {
      consoleFn(prefix, message, data);
    } else {
      consoleFn(prefix, message);
    }
  };
}

/**
 * Create a namespaced logger instance.
 *
 * @param namespace - Category for log output (e.g. 'throttle', 'batch', 'sync').
 * @returns Logger with `debug`, `info`, `warn`, `error` methods.
 */
export function logger(namespace: string): Logger {
  return {
    debug: createLogFn('debug', namespace, console.log.bind(console)),
    info: createLogFn('info', namespace, console.info.bind(console)),
    warn: createLogFn('warn', namespace, console.warn.bind(console)),
    error: createLogFn('error', namespace, console.error.bind(console)),
  };
}
