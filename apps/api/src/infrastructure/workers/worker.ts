/**
 * BullMQ Worker Process
 *
 * Runs as a separate process (or co-located for small deployments).
 * Processes background jobs: emails, analytics, snapshots, notifications, exports.
 */

import { Worker, type Job } from 'bullmq';
import { createLogger } from '@edgeflow/logger';
import { config } from '../config/env.js';
import { emailJobProcessor } from './processors/email.processor.js';
import { snapshotJobProcessor } from './processors/snapshot.processor.js';
import { notificationJobProcessor } from './processors/notification.processor.js';
import { exportJobProcessor } from './processors/export.processor.js';

const logger = createLogger({ service: 'worker' });

export type JobName =
  | 'send-email'
  | 'analytics-aggregate'
  | 'snapshot-create'
  | 'notification-create'
  | 'export-generate';

const redisConnection = {
  url: config.REDIS_URL,
  password: config.REDIS_PASSWORD || undefined,
};

const worker = new Worker<unknown, unknown, JobName>(
  'edgeflow-jobs',
  async (job: Job<unknown, unknown, JobName>) => {
    logger.info({ jobId: job.id, jobName: job.name }, 'Processing job');

    switch (job.name) {
      case 'send-email':
        return emailJobProcessor(job);
      case 'snapshot-create':
        return snapshotJobProcessor(job);
      case 'notification-create':
        return notificationJobProcessor(job);
      case 'export-generate':
        return exportJobProcessor(job);
      case 'analytics-aggregate':
        // Phase 12 — observability
        return;
      default:
        logger.warn({ jobName: job.name }, 'Unknown job type');
    }
  },
  {
    connection: redisConnection,
    concurrency: 10,
    limiter: {
      max: 50,
      duration: 1000,
    },
  },
);

worker.on('completed', (job) => {
  logger.info({ jobId: job.id, jobName: job.name }, 'Job completed');
});

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, jobName: job?.name, err }, 'Job failed');
});

worker.on('error', (err) => {
  logger.error({ err }, 'Worker error');
});

logger.info('BullMQ worker started');

export { worker };
