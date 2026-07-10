/**
 * Project Application Service
 */

import { createLogger } from '@edgeflow/logger';
import type { CreateProjectInput, UpdateProjectInput } from '@edgeflow/validation';
import type { ProjectRepository } from '../../infrastructure/repositories/project.repository.js';
import type { WorkspaceService } from '../workspace/workspace.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { CacheService } from '../../infrastructure/cache/cache.service.js';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../domain/errors/app-errors.js';
import { CacheKeys, CacheTTL } from '../../infrastructure/cache/cache.service.js';
import { totalProjects } from '../../infrastructure/observability/metrics.js';
import { enqueueExport, jobQueue } from '../../infrastructure/workers/queue.js';


const logger = createLogger({ service: 'project-service' });

export class ProjectService {
  constructor(
    private readonly projectRepo: ProjectRepository,
    private readonly workspaceService: WorkspaceService,
    private readonly auditService: AuditService,
    private readonly cache: CacheService,
  ) {}

  async createProject(
    workspaceId: string,
    userId: string,
    input: CreateProjectInput,
    ipAddress: string,
  ) {
    // Requires EDITOR or higher
    await this.workspaceService.assertRole(workspaceId, userId, 'EDITOR');

    const project = await this.projectRepo.create({
      workspaceId,
      name: input.name,
      description: input.description ?? undefined,
      visibility: input.visibility ?? undefined,
      createdByUserId: userId,
    });

    await this.cache.del(CacheKeys.projectList(workspaceId));
    totalProjects.add(1, { workspaceId });

    await this.auditService.log({
      actorUserId: userId,
      action: 'CREATE',
      resourceType: 'Project',
      resourceId: project.id,
      workspaceId,
      ipAddress,
      metadata: { name: project.name },
    });

    logger.info({ projectId: project.id, workspaceId, userId }, 'Project created');
    return project;
  }

  async getProject(workspaceId: string, projectId: string, userId: string) {
    // Workspace membership is required
    await this.workspaceService.assertRole(workspaceId, userId, 'VIEWER');

    const cached = await this.cache.get(CacheKeys.project(projectId));
    if (cached) return cached;

    const project = await this.projectRepo.findById(projectId);
    if (!project || project.workspaceId !== workspaceId) {
      throw new NotFoundError('Project', projectId);
    }

    // Check visibility
    if (project.visibility === 'PRIVATE' && project.createdByUserId !== userId) {
      // Check if they have explicit project membership
      const member = await this.checkProjectMembership(projectId, userId);
      if (!member) {
        // ADMIN/OWNER can still access private projects
        try {
          await this.workspaceService.assertRole(workspaceId, userId, 'ADMIN');
        } catch {
          throw new ForbiddenError('You do not have access to this project');
        }
      }
    }

    await this.cache.set(CacheKeys.project(projectId), project, CacheTTL.PROJECT);
    await this.projectRepo.touchLastAccessed(projectId);

    return project;
  }

  async listProjects(workspaceId: string, userId: string) {
    await this.workspaceService.assertRole(workspaceId, userId, 'VIEWER');
    return this.projectRepo.findByWorkspaceId(workspaceId, userId);
  }

  async updateProject(
    workspaceId: string,
    projectId: string,
    userId: string,
    input: UpdateProjectInput,
    ipAddress: string,
  ) {
    await this.workspaceService.assertRole(workspaceId, userId, 'EDITOR');

    const project = await this.projectRepo.findById(projectId);
    if (!project || project.workspaceId !== workspaceId) {
      throw new NotFoundError('Project', projectId);
    }

    const updated = await this.projectRepo.update(projectId, {
      name: input.name ?? undefined,
      description: input.description ?? undefined,
      visibility: input.visibility ?? undefined,
    });

    await this.cache.del(CacheKeys.project(projectId), CacheKeys.projectList(workspaceId));

    await this.auditService.log({
      actorUserId: userId,
      action: 'UPDATE',
      resourceType: 'Project',
      resourceId: projectId,
      workspaceId,
      ipAddress,
      metadata: { changes: input },
    });

    return updated;
  }

  async deleteProject(
    workspaceId: string,
    projectId: string,
    userId: string,
    ipAddress: string,
  ): Promise<void> {
    await this.workspaceService.assertRole(workspaceId, userId, 'ADMIN');

    const project = await this.projectRepo.findById(projectId);
    if (!project || project.workspaceId !== workspaceId) {
      throw new NotFoundError('Project', projectId);
    }

    await this.projectRepo.softDelete(projectId);
    await this.cache.del(CacheKeys.project(projectId), CacheKeys.projectList(workspaceId));

    await this.auditService.log({
      actorUserId: userId,
      action: 'DELETE',
      resourceType: 'Project',
      resourceId: projectId,
      workspaceId,
      ipAddress,
    });
  }

  private async checkProjectMembership(projectId: string, userId: string) {
    return this.projectRepo.findMember(projectId, userId);
  }

  async triggerExport(
    workspaceId: string,
    projectId: string,
    userId: string,
    format: 'PNG' | 'SVG' | 'PDF' | 'JSON' | 'YAML',
    ipAddress: string,
  ) {
    await this.getProject(workspaceId, projectId, userId);
    const requestId = crypto.randomUUID();

    // Enqueue the export job
    await enqueueExport({
      projectId,
      userId,
      format,
      requestId,
    });

    await this.auditService.log({
      actorUserId: userId,
      action: 'EXPORT',
      resourceType: 'Project',
      resourceId: projectId,
      workspaceId,
      ipAddress,
      metadata: { format, requestId },
    });

    // Find the latest job in the queue that matches this requestId
    const jobs = await jobQueue.getJobs(['waiting', 'active']);
    const job = jobs.find(j => (j.data as any)?.requestId === requestId);
    if (!job) {
      throw new Error('Failed to find enqueued export job');
    }

    return { id: job.id };
  }

  async getExportStatus(workspaceId: string, projectId: string, userId: string, jobId: string) {
    await this.workspaceService.assertRole(workspaceId, userId, 'VIEWER');
    const job = await jobQueue.getJob(jobId);
    if (!job) {
      throw new NotFoundError('ExportJob', jobId);
    }
    const state = await job.getState();
    const result = job.returnvalue;
    return {
      id: job.id,
      state,
      progress: job.progress,
      result,
      failedReason: job.failedReason,
    };
  }

  // Requirement 28: Canvas State Serialization (Parser / Printer Round-Trip)
  serializeState(state: any, format: 'JSON' | 'YAML'): string {
    if (format === 'JSON') {
      return JSON.stringify(state, null, 2);
    } else {
      return this.objectToYaml(state);
    }
  }

  deserializeState(data: string, format: 'JSON' | 'YAML'): any {
    if (format === 'JSON') {
      try {
        return JSON.parse(data);
      } catch (err) {
        throw new BadRequestError('Invalid JSON format');
      }
    } else {
      try {
        return this.yamlToObject(data);
      } catch (err) {
        throw new BadRequestError('Invalid YAML format');
      }
    }
  }

  private objectToYaml(obj: any, indent = 0): string {
    const spaces = ' '.repeat(indent);
    if (obj === null) return 'null\n';
    if (typeof obj !== 'object') {
      if (typeof obj === 'string') return `"${obj.replace(/"/g, '\\"')}"\n`;
      return `${obj}\n`;
    }
    if (Array.isArray(obj)) {
      if (obj.length === 0) return '[]\n';
      let result = '\n';
      for (const item of obj) {
        result += `${spaces}- ${this.objectToYaml(item, indent + 2).trimStart()}`;
      }
      return result;
    }
    let result = '\n';
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined) continue;
      const formattedValue = this.objectToYaml(value, indent + 2);
      if (typeof value === 'object' && value !== null) {
        result += `${spaces}${key}:${formattedValue}`;
      } else {
        result += `${spaces}${key}: ${formattedValue.trimStart()}`;
      }
    }
    return result;
  }

  private yamlToObject(yaml: string): any {
    const trimmed = yaml.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return JSON.parse(trimmed);
    }
    const result: any = {};
    const lines = yaml.split('\n');
    for (const line of lines) {
      const match = line.match(/^(\s*)([^:]+):\s*(.*)$/);
      if (match) {
        const key = match[2];
        const val = match[3];
        if (!key || val === undefined) continue;

        const trimmedVal = val.trim();
        if (trimmedVal.startsWith('"') && trimmedVal.endsWith('"')) {
          result[key.trim()] = trimmedVal.slice(1, -1);
        } else if (trimmedVal === 'null') {
          result[key.trim()] = null;
        } else if (trimmedVal === 'true') {
          result[key.trim()] = true;
        } else if (trimmedVal === 'false') {
          result[key.trim()] = false;
        } else if (!isNaN(Number(trimmedVal)) && trimmedVal !== '') {
          result[key.trim()] = Number(trimmedVal);
        } else {
          result[key.trim()] = trimmedVal;
        }
      }
    }
    return result;
  }
}
