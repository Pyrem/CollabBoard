import { describe, it, expect } from 'vitest';
import { ConnectionLimiter } from './connectionLimiter.js';

describe('ConnectionLimiter', () => {
  describe('per-IP limits', () => {
    it('allows connections up to the IP limit', () => {
      const limiter = new ConnectionLimiter(3, 5);

      const t1 = limiter.addConnection('1.2.3.4');
      const t2 = limiter.addConnection('1.2.3.4');
      const t3 = limiter.addConnection('1.2.3.4');

      expect(t1).not.toBeNull();
      expect(t2).not.toBeNull();
      expect(t3).not.toBeNull();
      expect(limiter.getIpConnectionCount('1.2.3.4')).toBe(3);
    });

    it('rejects connections exceeding the IP limit', () => {
      const limiter = new ConnectionLimiter(2, 5);

      limiter.addConnection('1.2.3.4');
      limiter.addConnection('1.2.3.4');
      const t3 = limiter.addConnection('1.2.3.4');

      expect(t3).toBeNull();
      expect(limiter.getIpConnectionCount('1.2.3.4')).toBe(2);
    });

    it('tracks different IPs independently', () => {
      const limiter = new ConnectionLimiter(2, 5);

      limiter.addConnection('1.2.3.4');
      limiter.addConnection('1.2.3.4');
      const t3 = limiter.addConnection('5.6.7.8');

      expect(t3).not.toBeNull();
      expect(limiter.getIpConnectionCount('1.2.3.4')).toBe(2);
      expect(limiter.getIpConnectionCount('5.6.7.8')).toBe(1);
    });

    it('frees a slot when a connection is removed', () => {
      const limiter = new ConnectionLimiter(2, 5);

      const t1 = limiter.addConnection('1.2.3.4');
      limiter.addConnection('1.2.3.4');

      // At limit
      expect(limiter.addConnection('1.2.3.4')).toBeNull();

      // Free one slot
      limiter.removeConnection(t1!);
      expect(limiter.getIpConnectionCount('1.2.3.4')).toBe(1);

      // Now a new one should be accepted
      const t3 = limiter.addConnection('1.2.3.4');
      expect(t3).not.toBeNull();
    });

    it('cleans up IP entry when count reaches zero', () => {
      const limiter = new ConnectionLimiter(5, 5);

      const t1 = limiter.addConnection('1.2.3.4');
      expect(limiter.trackedIpCount).toBe(1);

      limiter.removeConnection(t1!);
      expect(limiter.trackedIpCount).toBe(0);
      expect(limiter.getIpConnectionCount('1.2.3.4')).toBe(0);
    });
  });

  describe('per-user limits', () => {
    it('allows user associations up to the user limit', () => {
      const limiter = new ConnectionLimiter(10, 2);

      const t1 = limiter.addConnection('1.2.3.4')!;
      const t2 = limiter.addConnection('1.2.3.4')!;

      expect(limiter.associateUser(t1, 'user-a')).toBe(true);
      expect(limiter.associateUser(t2, 'user-a')).toBe(true);
      expect(limiter.getUserConnectionCount('user-a')).toBe(2);
    });

    it('rejects user associations exceeding the user limit', () => {
      const limiter = new ConnectionLimiter(10, 2);

      const t1 = limiter.addConnection('1.2.3.4')!;
      const t2 = limiter.addConnection('1.2.3.4')!;
      const t3 = limiter.addConnection('1.2.3.4')!;

      limiter.associateUser(t1, 'user-a');
      limiter.associateUser(t2, 'user-a');
      const result = limiter.associateUser(t3, 'user-a');

      expect(result).toBe(false);
      expect(limiter.getUserConnectionCount('user-a')).toBe(2);
    });

    it('tracks different users independently', () => {
      const limiter = new ConnectionLimiter(10, 2);

      const t1 = limiter.addConnection('1.2.3.4')!;
      const t2 = limiter.addConnection('1.2.3.4')!;
      const t3 = limiter.addConnection('5.6.7.8')!;

      limiter.associateUser(t1, 'user-a');
      limiter.associateUser(t2, 'user-a');
      const result = limiter.associateUser(t3, 'user-b');

      expect(result).toBe(true);
      expect(limiter.getUserConnectionCount('user-a')).toBe(2);
      expect(limiter.getUserConnectionCount('user-b')).toBe(1);
    });

    it('returns false for unknown connection tokens', () => {
      const limiter = new ConnectionLimiter(10, 5);
      const fakeToken = Symbol('fake');

      expect(limiter.associateUser(fakeToken, 'user-a')).toBe(false);
    });

    it('frees a user slot when the connection is removed', () => {
      const limiter = new ConnectionLimiter(10, 1);

      const t1 = limiter.addConnection('1.2.3.4')!;
      limiter.associateUser(t1, 'user-a');

      // At limit
      const t2 = limiter.addConnection('1.2.3.4')!;
      expect(limiter.associateUser(t2, 'user-a')).toBe(false);

      // Free the first connection
      limiter.removeConnection(t1);
      expect(limiter.getUserConnectionCount('user-a')).toBe(0);

      // Now a new association should succeed
      expect(limiter.associateUser(t2, 'user-a')).toBe(true);
    });
  });

  describe('stats', () => {
    it('reports totalConnections correctly', () => {
      const limiter = new ConnectionLimiter(10, 10);

      limiter.addConnection('1.2.3.4');
      limiter.addConnection('1.2.3.4');
      limiter.addConnection('5.6.7.8');

      expect(limiter.totalConnections).toBe(3);
    });

    it('reports trackedIpCount correctly', () => {
      const limiter = new ConnectionLimiter(10, 10);

      limiter.addConnection('1.2.3.4');
      limiter.addConnection('5.6.7.8');
      limiter.addConnection('9.10.11.12');

      expect(limiter.trackedIpCount).toBe(3);
    });

    it('reports trackedUserCount correctly', () => {
      const limiter = new ConnectionLimiter(10, 10);

      const t1 = limiter.addConnection('1.2.3.4')!;
      const t2 = limiter.addConnection('5.6.7.8')!;

      limiter.associateUser(t1, 'user-a');
      limiter.associateUser(t2, 'user-b');

      expect(limiter.trackedUserCount).toBe(2);
    });
  });

  describe('removeConnection', () => {
    it('is a no-op for unknown tokens', () => {
      const limiter = new ConnectionLimiter(10, 10);
      const fakeToken = Symbol('fake');

      // Should not throw
      limiter.removeConnection(fakeToken);
      expect(limiter.totalConnections).toBe(0);
    });

    it('decrements both IP and user counters', () => {
      const limiter = new ConnectionLimiter(10, 10);

      const t1 = limiter.addConnection('1.2.3.4')!;
      limiter.associateUser(t1, 'user-a');

      expect(limiter.getIpConnectionCount('1.2.3.4')).toBe(1);
      expect(limiter.getUserConnectionCount('user-a')).toBe(1);

      limiter.removeConnection(t1);

      expect(limiter.getIpConnectionCount('1.2.3.4')).toBe(0);
      expect(limiter.getUserConnectionCount('user-a')).toBe(0);
      expect(limiter.totalConnections).toBe(0);
    });
  });
});
