import type { Job } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { createLogger } from '@edgeflow/logger';
import { prisma } from '../../database/prisma.js';

type NotificationType = 'MENTION' | 'INVITATION' | 'COMMENT_REPLY' | 'PROJECT_SHARED' | 'WORKSPACE_ROLE_CHANGED' | 'VERSION_RESTORED';

const logger = createLogger({ service: 'notification-processor' });

export async function notificationJobProcessor(job: Job): Promise<void> {
  const { userId, type, title, body, metadata } = job.data as {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
  };

  await prisma.notification.create({
    data: { userId, type, title, body, metadata: (metadata ?? {}) as Prisma.InputJsonValue },
  });

  logger.info({ jobId: job.id, userId, type }, 'Notification created');
}
