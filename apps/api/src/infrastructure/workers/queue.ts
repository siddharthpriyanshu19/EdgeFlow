/**
 * BullMQ Queue
 *
 * Enqueue background jobs from application services.
 * Uses a direct Redis connection URL rather than a shared client instance
 * to avoid ioredis version conflicts between BullMQ's bundled ioredis and ours.
 */

import { Queue } from 'bullmq';
import { config } from '../config/env.js';
import type { JobName } from './worker.js';

const redisConnection = {
  url: config.REDIS_URL,
  password: config.REDIS_PASSWORD || undefined,
};

export const jobQueue = new Queue<unknown, unknown, JobName>('edgeflow-jobs', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

export async function enqueueEmail(data: {
  to: string;
  type: 'verification' | 'password-reset' | 'invitation';
  payload: Record<string, unknown>;
}): Promise<void> {
  await jobQueue.add('send-email', data, { priority: 1 });
}

export async function enqueueSnapshot(data: {
  projectId: string;
  sequenceNumber: number;
}): Promise<void> {
  await jobQueue.add('snapshot-create', data, { priority: 3 });
}

export async function enqueueNotification(data: {
  userId: string;
  type: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown> | undefined;
}): Promise<void> {
  await jobQueue.add('notification-create', data, { priority: 2 });
}

export async function enqueueExport(data: {
  projectId: string;
  userId: string;
  format: 'PNG' | 'SVG' | 'PDF' | 'JSON' | 'YAML';
  requestId: string;
}): Promise<void> {
  await jobQueue.add('export-generate', data, { priority: 5 });
}
