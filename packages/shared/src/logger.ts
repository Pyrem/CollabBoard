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

/**
 * Read the debug configuration string from the runtime environment.
 *
 * Resolution order:
 * 1. `localStorage.getItem('collabboard:debug')` — browser.
 * 2. `process.env.COLLABBOARD_DEBUG` — Node.js.
 * 3. `''` (empty string) — debug output is ON by default.
 *
 * The function is intentionally defensive (`try/catch`) because
 * `localStorage` may throw in SSR contexts and `process` may be
 * undefined in browser bundles.
 *
 * @returns The raw config string, or `''` if nothing is set.
 */
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
 * Determine whether `debug`-level output is suppressed for `namespace`.
 *
 * The debug config (see {@link getDebugConfig}) is interpreted as follows:
 *
 * | Config value            | Effect                                    |
 * |-------------------------|-------------------------------------------|
 * | `''` (empty / unset)    | Debug ON for all namespaces (default).    |
 * | `'false'` / `'0'`       | Debug OFF globally.                       |
 * | `'true'` / `'1'` / `'*'`| Debug ON for all namespaces.              |
 * | `'throttle,cursor'`      | Debug ON only for listed namespaces.      |
 *
 * `info`, `warn`, and `error` are **never** suppressed.
 *
 * @param namespace - The logger namespace to check.
 * @returns `true` if debug output should be suppressed for this namespace.
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
 * Create a namespaced {@link Logger} instance.
 *
 * Each method (`debug`, `info`, `warn`, `error`) prefixes output with
 * `[namespace]` and optionally appends a structured data object.
 * Debug-level output respects the runtime configuration described in
 * {@link isDebugSuppressed}.
 *
 * @param namespace - Short category tag for log output (e.g. `'throttle'`,
 *   `'batch'`, `'sync'`, `'containment'`).
 * @returns A `Logger` instance with four severity methods.
 *
 * @example
 * const log = logger('sync');
 * log.debug('object updated', { id: '...', field: 'x' });
 * log.warn('latency spike', { ms: 340 });
 */
export function logger(namespace: string): Logger {
  return {
    debug: createLogFn('debug', namespace, console.log.bind(console)),
    info: createLogFn('info', namespace, console.info.bind(console)),
    warn: createLogFn('warn', namespace, console.warn.bind(console)),
    error: createLogFn('error', namespace, console.error.bind(console)),
  };
}
