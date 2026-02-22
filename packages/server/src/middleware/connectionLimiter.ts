import { MAX_CONNECTIONS_PER_IP, MAX_CONNECTIONS_PER_USER, logger } from '@collabboard/shared';

const log = logger('connection-limiter');

/**
 * Unique token representing a single WebSocket connection.
 *
 * Used internally by {@link ConnectionLimiter} to track the relationship
 * between a socket, its source IP, and (after authentication) the user ID.
 */
export type ConnectionToken = symbol;

/**
 * Tracks concurrent WebSocket connections per IP address and per
 * authenticated user, enforcing configurable limits on each.
 *
 * ## Lifecycle
 *
 * 1. **`addConnection(ip)`** — called during the WebSocket `upgrade` event.
 *    If the IP limit is exceeded the method returns `null` and the caller
 *    should destroy the socket. Otherwise it returns a unique
 *    {@link ConnectionToken}.
 *
 * 2. **`associateUser(token, userId)`** — called after successful
 *    authentication (e.g. inside `onAuthenticate`). If the per-user limit
 *    is exceeded it returns `false` and the caller should close the
 *    connection.
 *
 * 3. **`removeConnection(token)`** — called when the socket closes.
 *    Decrements counters for both the IP and the user (if one was
 *    associated).
 */
export class ConnectionLimiter {
  private readonly maxPerIp: number;
  private readonly maxPerUser: number;

  /** IP address → number of active connections from that IP. */
  private readonly ipCounts = new Map<string, number>();

  /** User ID → number of active connections for that user. */
  private readonly userCounts = new Map<string, number>();

  /** Token → source IP. Every tracked connection has an entry here. */
  private readonly tokenToIp = new Map<ConnectionToken, string>();

  /** Token → user ID. Populated only after {@link associateUser}. */
  private readonly tokenToUser = new Map<ConnectionToken, string>();

  constructor(
    maxPerIp: number = MAX_CONNECTIONS_PER_IP,
    maxPerUser: number = MAX_CONNECTIONS_PER_USER,
  ) {
    this.maxPerIp = maxPerIp;
    this.maxPerUser = maxPerUser;
  }

  /**
   * Register a new connection from `ip`.
   *
   * @returns A {@link ConnectionToken} if the connection is accepted, or
   *   `null` if the per-IP limit has been reached.
   */
  addConnection(ip: string): ConnectionToken | null {
    const current = this.ipCounts.get(ip) ?? 0;

    if (current >= this.maxPerIp) {
      log.warn(`IP limit reached for ${ip} (${String(current)}/${String(this.maxPerIp)})`);
      return null;
    }

    const token: ConnectionToken = Symbol('conn');
    this.ipCounts.set(ip, current + 1);
    this.tokenToIp.set(token, ip);

    log.debug(`Connection added for IP ${ip} (${String(current + 1)}/${String(this.maxPerIp)})`);
    return token;
  }

  /**
   * Associate an authenticated user with an existing connection.
   *
   * @returns `true` if the connection is allowed, `false` if the per-user
   *   limit has been reached (the caller should close the connection).
   */
  associateUser(token: ConnectionToken, userId: string): boolean {
    if (!this.tokenToIp.has(token)) {
      log.warn('Attempted to associate user with unknown connection token');
      return false;
    }

    const current = this.userCounts.get(userId) ?? 0;

    if (current >= this.maxPerUser) {
      log.warn(
        `User limit reached for ${userId} (${String(current)}/${String(this.maxPerUser)})`,
      );
      return false;
    }

    this.userCounts.set(userId, current + 1);
    this.tokenToUser.set(token, userId);

    log.debug(
      `User ${userId} associated (${String(current + 1)}/${String(this.maxPerUser)})`,
    );
    return true;
  }

  /**
   * Remove a tracked connection, decrementing both the IP and (if set)
   * the user counters.
   */
  removeConnection(token: ConnectionToken): void {
    const ip = this.tokenToIp.get(token);
    if (ip !== undefined) {
      const count = (this.ipCounts.get(ip) ?? 1) - 1;
      if (count <= 0) {
        this.ipCounts.delete(ip);
      } else {
        this.ipCounts.set(ip, count);
      }
      this.tokenToIp.delete(token);
    }

    const userId = this.tokenToUser.get(token);
    if (userId !== undefined) {
      const count = (this.userCounts.get(userId) ?? 1) - 1;
      if (count <= 0) {
        this.userCounts.delete(userId);
      } else {
        this.userCounts.set(userId, count);
      }
      this.tokenToUser.delete(token);
    }
  }

  /** Number of distinct IPs currently tracked. */
  get trackedIpCount(): number {
    return this.ipCounts.size;
  }

  /** Number of distinct users currently tracked. */
  get trackedUserCount(): number {
    return this.userCounts.size;
  }

  /** Total number of active connections. */
  get totalConnections(): number {
    return this.tokenToIp.size;
  }

  /** Current connection count for a given IP. */
  getIpConnectionCount(ip: string): number {
    return this.ipCounts.get(ip) ?? 0;
  }

  /** Current connection count for a given user. */
  getUserConnectionCount(userId: string): number {
    return this.userCounts.get(userId) ?? 0;
  }
}
