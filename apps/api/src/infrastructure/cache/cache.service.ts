/**
 * Cache Service
 *
 * Type-safe, serialization-aware wrapper around Redis.
 * All cache reads/writes go through this service — never raw Redis calls from business logic.
 */

import type Redis from 'ioredis';
import { createLogger } from '@edgeflow/logger';
import { cacheHits, cacheMisses } from '../observability/metrics.js';

const logger = createLogger({ service: 'cache' });

export class CacheService {
  constructor(private readonly redis: Redis) {}

  /**
   * Get a cached value. Returns null on cache miss.
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      if (raw === null) {
        cacheMisses.add(1, { key_prefix: this.getKeyPrefix(key) });
        return null;
      }
      cacheHits.add(1, { key_prefix: this.getKeyPrefix(key) });
      return JSON.parse(raw) as T;
    } catch (err) {
      logger.error({ err, key }, 'Cache GET failed');
      return null;
    }
  }

  /**
   * Set a cache value with optional TTL in seconds.
   */
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds !== undefined) {
        await this.redis.set(key, serialized, 'EX', ttlSeconds);
      } else {
        await this.redis.set(key, serialized);
      }
    } catch (err) {
      logger.error({ err, key }, 'Cache SET failed');
    }
  }

  /**
   * Delete one or more cache keys.
   */
  async del(...keys: string[]): Promise<void> {
    try {
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (err) {
      logger.error({ err, keys }, 'Cache DEL failed');
    }
  }

  /**
   * Delete all keys matching a pattern. Use sparingly — SCAN-based, not KEYS.
   */
  async invalidatePattern(pattern: string): Promise<void> {
    try {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      } while (cursor !== '0');
    } catch (err) {
      logger.error({ err, pattern }, 'Cache pattern invalidation failed');
    }
  }

  /**
   * Check if a key exists.
   */
  async exists(key: string): Promise<boolean> {
    try {
      const count = await this.redis.exists(key);
      return count > 0;
    } catch (err) {
      logger.error({ err, key }, 'Cache EXISTS failed');
      return false;
    }
  }

  /**
   * Increment a numeric counter.
   */
  async increment(key: string, by = 1): Promise<number> {
    return this.redis.incrby(key, by);
  }

  /**
   * Get remaining TTL in seconds. Returns -1 if no TTL, -2 if key doesn't exist.
   */
  async ttl(key: string): Promise<number> {
    return this.redis.ttl(key);
  }

  private getKeyPrefix(key: string): string {
    return key.split(':')[0] ?? key;
  }
}

// ─── Cache key builders ──────────────────────────────────────────────────────

export const CacheKeys = {
  user: (userId: string) => `user:${userId}`,
  userByEmail: (email: string) => `user:email:${email}`,
  workspace: (workspaceId: string) => `workspace:${workspaceId}`,
  workspaceMembers: (workspaceId: string) => `workspace:${workspaceId}:members`,
  project: (projectId: string) => `project:${projectId}`,
  projectList: (workspaceId: string) => `workspace:${workspaceId}:projects`,
  refreshToken: (tokenId: string) => `refresh_token:${tokenId}`,
  emailVerification: (token: string) => `email_verify:${token}`,
  passwordReset: (token: string) => `password_reset:${token}`,
  roomPresence: (roomId: string) => `room:${roomId}:presence`,
  roomSequence: (roomId: string) => `room:${roomId}:sequence`,
  snapshot: (projectId: string) => `snapshot:${projectId}:latest`,
  rateLimit: (identifier: string) => `rate_limit:${identifier}`,
} as const;

// ─── TTL constants (seconds) ─────────────────────────────────────────────────

export const CacheTTL = {
  USER: 300,         // 5 minutes
  WORKSPACE: 300,
  PROJECT: 120,
  PROJECT_LIST: 60,
  REFRESH_TOKEN: 86400 * 90, // 90 days max
  EMAIL_VERIFY: 86400,       // 24 hours
  PASSWORD_RESET: 3600,      // 1 hour
  ROOM_PRESENCE: 30,
  SNAPSHOT: 600,             // 10 minutes
} as const;
