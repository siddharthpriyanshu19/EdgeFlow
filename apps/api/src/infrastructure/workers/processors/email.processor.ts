import type { Job } from 'bullmq';
import { createLogger } from '@edgeflow/logger';
import { EmailService } from '../../email/email.service.js';

const logger = createLogger({ service: 'email-processor' });
const emailService = new EmailService();

export async function emailJobProcessor(job: Job): Promise<void> {
  const { to, type, payload } = job.data as {
    to: string;
    type: 'verification' | 'password-reset' | 'invitation';
    payload: Record<string, unknown>;
  };

  logger.info({ jobId: job.id, to, type }, 'Processing email job');

  switch (type) {
    case 'verification':
      await emailService.sendVerificationEmail(to, payload['displayName'] as string, payload['token'] as string);
      break;
    case 'password-reset':
      await emailService.sendPasswordResetEmail(to, payload['displayName'] as string, payload['token'] as string);
      break;
    case 'invitation':
      await emailService.sendWorkspaceInvitationEmail(
        to,
        payload['inviterName'] as string,
        payload['workspaceName'] as string,
        payload['token'] as string,
      );
      break;
  }
}
