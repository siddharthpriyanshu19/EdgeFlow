/**
 * Prisma Client Singleton
 *
 * Returns a single PrismaClient instance per process.
 * In development, attaches to globalThis to prevent hot-reload from creating
 * multiple connections.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';
import { createLogger } from '@edgeflow/logger';
import { config } from '../config/env.js';

const logger = createLogger({ service: 'prisma' });

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaLibSQL({
    url: config.TURSO_DATABASE_URL || config.DATABASE_URL,
    authToken: config.TURSO_AUTH_TOKEN || undefined,
  });

  return new PrismaClient({
    adapter,
    log: [
      { level: 'query', emit: 'event' },
      { level: 'error', emit: 'event' },
      { level: 'warn', emit: 'event' },
    ],
  });
}

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__prisma ??
  (() => {
    const client = createPrismaClient();

    // Log slow queries in development
    if (process.env['NODE_ENV'] !== 'production') {
      (client as any).$on('query', (e: { query: string; duration: number }) => {
        if (e.duration > 100) {
          logger.warn({ query: e.query, duration: e.duration }, 'Slow Prisma query detected');
        }
      });
    }

    (client as any).$on('error', (e: { message: string }) => {
      logger.error({ message: e.message }, 'Prisma error');
    });

    return client;
  })();

if (process.env['NODE_ENV'] !== 'production') {
  globalThis.__prisma = prisma;
}

/**
 * Graceful disconnect — call on SIGTERM/SIGINT.
 */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
