/**
 * Workspace Routes
 *
 * GET    /workspaces                   — list my workspaces
 * POST   /workspaces                   — create workspace
 * GET    /workspaces/:workspaceId       — get workspace details
 * PATCH  /workspaces/:workspaceId       — update workspace
 * DELETE /workspaces/:workspaceId       — soft-delete workspace
 * GET    /workspaces/:workspaceId/members
 * POST   /workspaces/:workspaceId/invitations
 * POST   /workspaces/:workspaceId/invitations/:token/accept
 * PATCH  /workspaces/:workspaceId/members/:userId
 * DELETE /workspaces/:workspaceId/members/:userId
 * GET    /workspaces/:workspaceId/audit
 */

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../hooks/authenticate.js';
import { WorkspaceController } from '../controllers/workspace.controller.js';
import { WorkspaceService } from '../../application/workspace/workspace.service.js';
import { WorkspaceRepository } from '../../infrastructure/repositories/workspace.repository.js';
import { UserRepository } from '../../infrastructure/repositories/user.repository.js';
import { AuditService } from '../../application/audit/audit.service.js';
import { AuditLogRepository } from '../../infrastructure/repositories/audit-log.repository.js';
import { EmailService } from '../../infrastructure/email/email.service.js';
import { CacheService } from '../../infrastructure/cache/cache.service.js';
import { prisma } from '../../infrastructure/database/prisma.js';
import { getCacheClient } from '../../infrastructure/cache/redis.js';

export async function workspaceRoutes(app: FastifyInstance): Promise<void> {
  const cacheService = new CacheService(getCacheClient());
  const workspaceRepo = new WorkspaceRepository(prisma);
  const userRepo = new UserRepository(prisma);
  const auditLogRepo = new AuditLogRepository(prisma);
  const auditService = new AuditService(auditLogRepo);
  const emailService = new EmailService();

  const workspaceService = new WorkspaceService(
    workspaceRepo,
    userRepo,
    auditService,
    emailService,
    cacheService,
  );

  const controller = new WorkspaceController(workspaceService);

  // All workspace routes require authentication
  app.addHook('preHandler', authenticate);

  app.get('/', controller.list.bind(controller));
  app.post('/', controller.create.bind(controller));
  app.get('/:workspaceId', controller.getById.bind(controller));
  app.patch('/:workspaceId', controller.update.bind(controller));
  app.delete('/:workspaceId', controller.softDelete.bind(controller));
  app.get('/:workspaceId/members', controller.listMembers.bind(controller));
  app.post('/:workspaceId/invitations', controller.invite.bind(controller));
  app.post('/invitations/:token/accept', controller.acceptInvitation.bind(controller));
  app.patch('/:workspaceId/members/:userId', controller.updateMemberRole.bind(controller));
  app.delete('/:workspaceId/members/:userId', controller.removeMember.bind(controller));
  app.get('/:workspaceId/audit', controller.getAuditLog.bind(controller));
  app.get('/:workspaceId/search', controller.search.bind(controller));
}

