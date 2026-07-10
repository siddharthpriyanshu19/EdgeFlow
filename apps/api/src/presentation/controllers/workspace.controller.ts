/**
 * Workspace Controller
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  CreateWorkspaceSchema,
  UpdateWorkspaceSchema,
  InviteMemberSchema,
  UpdateMemberRoleSchema,
  validateOrThrow,
} from '@edgeflow/validation';
import type { WorkspaceService } from '../../application/workspace/workspace.service.js';
import type { JwtPayload } from '../hooks/authenticate.js';

function uid(request: FastifyRequest): string {
  return (request.user as JwtPayload).sub;
}

type WorkspaceParams = { workspaceId: string };
type MemberParams = { workspaceId: string; userId: string };
type InvitationParams = { token: string };

export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  async list(request: FastifyRequest, reply: FastifyReply) {
    const workspaces = await this.workspaceService.listWorkspaces(uid(request));
    return reply.send({ success: true, data: workspaces });
  }

  async create(request: FastifyRequest, reply: FastifyReply) {
    const input = validateOrThrow(CreateWorkspaceSchema, request.body);
    const workspace = await this.workspaceService.createWorkspace(uid(request), input, request.ip);
    return reply.status(201).send({ success: true, data: workspace });
  }

  async getById(request: FastifyRequest, reply: FastifyReply) {
    const { workspaceId } = request.params as { workspaceId: string };
    const workspace = await this.workspaceService.getWorkspace(workspaceId, uid(request));
    return reply.send({ success: true, data: workspace });
  }

  async update(request: FastifyRequest, reply: FastifyReply) {
    const { workspaceId } = request.params as { workspaceId: string };
    const input = validateOrThrow(UpdateWorkspaceSchema, request.body);
    const workspace = await this.workspaceService.updateWorkspace(
      workspaceId,
      uid(request),
      input,
      request.ip,
    );
    return reply.send({ success: true, data: workspace });
  }

  async softDelete(request: FastifyRequest, reply: FastifyReply) {
    const { workspaceId } = request.params as { workspaceId: string };
    await this.workspaceService.deleteWorkspace(workspaceId, uid(request), request.ip);
    return reply.status(204).send();
  }

  async listMembers(request: FastifyRequest, reply: FastifyReply) {
    const { workspaceId } = request.params as { workspaceId: string };
    const members = await this.workspaceService.listMembers(workspaceId, uid(request));
    return reply.send({ success: true, data: members });
  }

  async invite(request: FastifyRequest, reply: FastifyReply) {
    const { workspaceId } = request.params as { workspaceId: string };
    const input = validateOrThrow(InviteMemberSchema, request.body);
    const result = await this.workspaceService.inviteMember(
      workspaceId,
      uid(request),
      input,
      request.ip,
    );
    return reply.status(201).send({ success: true, data: result });
  }

  async acceptInvitation(request: FastifyRequest, reply: FastifyReply) {
    const { token } = request.params as { token: string };
    const result = await this.workspaceService.acceptInvitation(token, uid(request));
    return reply.send({ success: true, data: result });
  }

  async updateMemberRole(request: FastifyRequest, reply: FastifyReply) {
    const { workspaceId, userId } = request.params as { workspaceId: string; userId: string };
    const input = validateOrThrow(UpdateMemberRoleSchema, request.body);
    await this.workspaceService.updateMemberRole(workspaceId, uid(request), userId, input, request.ip);
    return reply.send({ success: true, data: { message: 'Role updated' } });
  }

  async removeMember(request: FastifyRequest, reply: FastifyReply) {
    const { workspaceId, userId } = request.params as { workspaceId: string; userId: string };
    await this.workspaceService.removeMember(workspaceId, uid(request), userId, request.ip);
    return reply.status(204).send();
  }

  async getAuditLog(request: FastifyRequest, reply: FastifyReply) {
    const { workspaceId } = request.params as { workspaceId: string };
    const { page, limit } = request.query as { page?: number; limit?: number };
    const auditLogs = await this.workspaceService.getWorkspaceAuditLog(workspaceId, uid(request), page, limit);
    return reply.send({ success: true, data: auditLogs });
  }

  async search(request: FastifyRequest, reply: FastifyReply) {
    const { workspaceId } = request.params as { workspaceId: string };
    const { query, type, page, limit } = request.query as {
      query: string;
      type?: 'Project' | 'Node' | 'Connection' | 'Comment' | 'User';
      page?: number;
      limit?: number;
    };
    const filters = {
      ...(type !== undefined ? { type } : {}),
      ...(page !== undefined ? { page } : {}),
      ...(limit !== undefined ? { limit } : {}),
    };
    const results = await this.workspaceService.searchWorkspace(workspaceId, uid(request), query || '', filters);
    return reply.send({ success: true, data: results });
  }
}
