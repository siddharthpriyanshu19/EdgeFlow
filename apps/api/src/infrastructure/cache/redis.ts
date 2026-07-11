/**
 * Redis Client Factory
 *
 * Creates typed Redis clients using ioredis.
 * Provides separate clients for:
 *   - cache: GET/SET/DEL operations
 *   - pubsub-publisher: PUBLISH operations
 *   - pubsub-subscriber: SUBSCRIBE operations (dedicated connection)
 *
 * ioredis requires separate connections for pub/sub because a subscribed
 * connection cannot issue regular commands.
 */

import { Redis, type RedisOptions } from 'ioredis';
import { createLogger } from '@edgeflow/logger';
import { config } from '../config/env.js';

const logger = createLogger({ service: 'redis' });

function buildRedisOptions(): RedisOptions {
  return {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    retryStrategy(times: number): number | null {
      if (times > 10) {
        logger.error({ times }, 'Redis connection failed after max retries');
        return null;
      }
      return Math.min(times * 100, 3000);
    },
    reconnectOnError(err: Error): boolean {
      const targetErrors = ['READONLY', 'ECONNRESET', 'ECONNREFUSED'];
      return targetErrors.some((e) => err.message.includes(e));
    },
    password: config.REDIS_PASSWORD || undefined,
  };
}

function attachEventHandlers(client: Redis, name: string): void {
  client.on('connect', () => logger.info({ client: name }, 'Redis connected'));
  client.on('ready', () => logger.info({ client: name }, 'Redis ready'));
  client.on('error', (err) => logger.error({ client: name, err }, 'Redis error'));
  client.on('close', () => logger.warn({ client: name }, 'Redis connection closed'));
  client.on('reconnecting', () => logger.warn({ client: name }, 'Redis reconnecting'));
}

// ─── Singletons ──────────────────────────────────────────────────────────────

let _cacheClient: Redis | null = null;
let _publisherClient: Redis | null = null;
let _subscriberClient: Redis | null = null;

export function getCacheClient(): Redis {
  if (!_cacheClient) {
    _cacheClient = new Redis(config.REDIS_URL, buildRedisOptions());
    attachEventHandlers(_cacheClient, 'cache');
  }
  return _cacheClient;
}

export function getPublisherClient(): Redis {
  if (!_publisherClient) {
    _publisherClient = new Redis(config.REDIS_URL, buildRedisOptions());
    attachEventHandlers(_publisherClient, 'publisher');
  }
  return _publisherClient;
}

export function getSubscriberClient(): Redis {
  if (!_subscriberClient) {
    _subscriberClient = new Redis(config.REDIS_URL, buildRedisOptions());
    attachEventHandlers(_subscriberClient, 'subscriber');
  }
  return _subscriberClient;
}

export async function connectAllRedisClients(): Promise<void> {
  await Promise.all([
    getCacheClient().connect(),
    getPublisherClient().connect(),
    getSubscriberClient().connect(),
  ]);
  logger.info('All Redis clients connected');
}

export async function disconnectAllRedisClients(): Promise<void> {
  await Promise.all(
    [_cacheClient, _publisherClient, _subscriberClient]
      .filter(Boolean)
      .map((c) => c!.quit()),
  );
  logger.info('All Redis clients disconnected');
}
