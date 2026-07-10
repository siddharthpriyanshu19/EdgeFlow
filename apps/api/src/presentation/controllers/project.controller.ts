/**
 * Project Controller
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  CreateProjectSchema,
  UpdateProjectSchema,
  validateOrThrow,
} from '@edgeflow/validation';
import type { ProjectService } from '../../application/project/project.service.js';
import type { JwtPayload } from '../hooks/authenticate.js';

function uid(request: FastifyRequest): string {
  return (request.user as JwtPayload).sub;
}

export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  async list(request: FastifyRequest, reply: FastifyReply) {
    const { workspaceId } = request.params as { workspaceId: string };
    const projects = await this.projectService.listProjects(workspaceId, uid(request));
    return reply.send({ success: true, data: projects });
  }

  async create(request: FastifyRequest, reply: FastifyReply) {
    const { workspaceId } = request.params as { workspaceId: string };
    const input = validateOrThrow(CreateProjectSchema, request.body);
    const project = await this.projectService.createProject(
      workspaceId,
      uid(request),
      { ...input, visibility: input.visibility ?? 'PRIVATE' },
      request.ip,
    );
    return reply.status(201).send({ success: true, data: project });
  }

  async getById(request: FastifyRequest, reply: FastifyReply) {
    const { workspaceId, projectId } = request.params as { workspaceId: string; projectId: string };
    const project = await this.projectService.getProject(workspaceId, projectId, uid(request));
    return reply.send({ success: true, data: project });
  }

  async update(request: FastifyRequest, reply: FastifyReply) {
    const { workspaceId, projectId } = request.params as { workspaceId: string; projectId: string };
    const input = validateOrThrow(UpdateProjectSchema, request.body);
    const project = await this.projectService.updateProject(
      workspaceId,
      projectId,
      uid(request),
      input,
      request.ip,
    );
    return reply.send({ success: true, data: project });
  }

  async softDelete(request: FastifyRequest, reply: FastifyReply) {
    const { workspaceId, projectId } = request.params as { workspaceId: string; projectId: string };
    await this.projectService.deleteProject(workspaceId, projectId, uid(request), request.ip);
    return reply.status(204).send();
  }

  async exportProject(request: FastifyRequest, reply: FastifyReply) {
    const { workspaceId, projectId } = request.params as { workspaceId: string; projectId: string };
    const { format } = request.body as { format: 'PNG' | 'SVG' | 'PDF' | 'JSON' | 'YAML' };
    const job = await this.projectService.triggerExport(workspaceId, projectId, uid(request), format || 'JSON', request.ip);
    return reply.status(202).send({ success: true, data: { jobId: job.id, message: 'Export job queued successfully' } });
  }

  async getExportStatus(request: FastifyRequest, reply: FastifyReply) {
    const { workspaceId, projectId, jobId } = request.params as { workspaceId: string; projectId: string; jobId: string };
    const status = await this.projectService.getExportStatus(workspaceId, projectId, uid(request), jobId);
    return reply.send({ success: true, data: status });
  }
}
