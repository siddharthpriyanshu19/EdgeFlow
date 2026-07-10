/**
 * Project Routes
 *
 * GET    /workspaces/:workspaceId/projects
 * POST   /workspaces/:workspaceId/projects
 * GET    /workspaces/:workspaceId/projects/:projectId
 * PATCH  /workspaces/:workspaceId/projects/:projectId
 * DELETE /workspaces/:workspaceId/projects/:projectId
 */

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../hooks/authenticate.js';
import { ProjectController } from '../controllers/project.controller.js';
import { ProjectService } from '../../application/project/project.service.js';
import { ProjectRepository } from '../../infrastructure/repositories/project.repository.js';
import { WorkspaceRepository } from '../../infrastructure/repositories/workspace.repository.js';
import { WorkspaceService } from '../../application/workspace/workspace.service.js';
import { UserRepository } from '../../infrastructure/repositories/user.repository.js';
import { AuditService } from '../../application/audit/audit.service.js';
import { AuditLogRepository } from '../../infrastructure/repositories/audit-log.repository.js';
import { EmailService } from '../../infrastructure/email/email.service.js';
import { CacheService } from '../../infrastructure/cache/cache.service.js';
import { prisma } from '../../infrastructure/database/prisma.js';
import { getCacheClient } from '../../infrastructure/cache/redis.js';

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  const cacheService = new CacheService(getCacheClient());
  const projectRepo = new ProjectRepository(prisma);
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

  const projectService = new ProjectService(
    projectRepo,
    workspaceService,
    auditService,
    cacheService,
  );

  const controller = new ProjectController(projectService);

  app.addHook('preHandler', authenticate);

  app.get('/', controller.list.bind(controller));
  app.post('/', controller.create.bind(controller));
  app.get('/:projectId', controller.getById.bind(controller));
  app.patch('/:projectId', controller.update.bind(controller));
  app.delete('/:projectId', controller.softDelete.bind(controller));
  app.post('/:projectId/export', controller.exportProject.bind(controller));
  app.get('/:projectId/exports/:jobId', controller.getExportStatus.bind(controller));
}

