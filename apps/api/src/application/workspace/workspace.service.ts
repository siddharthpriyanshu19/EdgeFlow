/**
 * Workspace Application Service
 */

import crypto from 'node:crypto';
import { createLogger } from '@edgeflow/logger';
import type {
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  InviteMemberInput,
  UpdateMemberRoleInput,
} from '@edgeflow/validation';
import type { UpdateWorkspaceData, WorkspaceRepository } from '../../infrastructure/repositories/workspace.repository.js';
import type { UserRepository } from '../../infrastructure/repositories/user.repository.js';
import type { AuditService } from '../audit/audit.service.js';
import type { EmailService } from '../../infrastructure/email/email.service.js';
import type { CacheService } from '../../infrastructure/cache/cache.service.js';
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  BadRequestError,
} from '../../domain/errors/app-errors.js';
import { CacheKeys, CacheTTL } from '../../infrastructure/cache/cache.service.js';
import { prisma } from '../../infrastructure/database/prisma.js';


const logger = createLogger({ service: 'workspace-service' });

const ROLE_HIERARCHY = { VIEWER: 0, EDITOR: 1, ADMIN: 2, OWNER: 3 } as const;
const INVITATION_TTL_DAYS = 7;

export class WorkspaceService {
  constructor(
    private readonly workspaceRepo: WorkspaceRepository,
    private readonly userRepo: UserRepository,
    private readonly auditService: AuditService,
    private readonly emailService: EmailService,
    private readonly cache: CacheService,
  ) {}

  async createWorkspace(userId: string, input: CreateWorkspaceInput, ipAddress: string) {
    const slug = this.generateSlug(input.name);

    const existing = await this.workspaceRepo.findBySlug(slug);
    if (existing) {
      // Append a random suffix to ensure uniqueness
      const uniqueSlug = `${slug}-${crypto.randomBytes(3).toString('hex')}`;
      return this.doCreate(userId, input, uniqueSlug, ipAddress);
    }

    return this.doCreate(userId, input, slug, ipAddress);
  }

  private async doCreate(
    userId: string,
    input: CreateWorkspaceInput,
    slug: string,
    ipAddress: string,
  ) {
    const workspace = await this.workspaceRepo.create({
      name: input.name,
      slug,
      description: input.description ?? undefined,
      logoUrl: input.logoUrl ?? undefined,
      ownerId: userId,
    });

    await this.auditService.log({
      actorUserId: userId,
      action: 'CREATE',
      resourceType: 'Workspace',
      resourceId: workspace.id,
      workspaceId: workspace.id,
      ipAddress,
      metadata: { name: workspace.name },
    });

    logger.info({ workspaceId: workspace.id, userId }, 'Workspace created');
    return workspace;
  }

  async getWorkspace(workspaceId: string, userId: string) {
    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace) throw new NotFoundError('Workspace', workspaceId);

    await this.assertMember(workspaceId, userId);
    return workspace;
  }

  async listWorkspaces(userId: string) {
    return this.workspaceRepo.findByUserId(userId);
  }

  async updateWorkspace(
    workspaceId: string,
    userId: string,
    input: UpdateWorkspaceInput,
    ipAddress: string,
  ) {
    await this.assertRole(workspaceId, userId, 'ADMIN');

    const updateData: UpdateWorkspaceData = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description ?? undefined;
    if (input.logoUrl !== undefined) updateData.logoUrl = input.logoUrl ?? undefined;

    const workspace = await this.workspaceRepo.update(workspaceId, updateData);

    await this.cache.del(CacheKeys.workspace(workspaceId));

    await this.auditService.log({
      actorUserId: userId,
      action: 'UPDATE',
      resourceType: 'Workspace',
      resourceId: workspaceId,
      workspaceId,
      ipAddress,
      metadata: { changes: input },
    });

    return workspace;
  }

  async deleteWorkspace(workspaceId: string, userId: string, ipAddress: string): Promise<void> {
    await this.assertRole(workspaceId, userId, 'OWNER');
    await this.workspaceRepo.softDelete(workspaceId);
    await this.cache.del(CacheKeys.workspace(workspaceId), CacheKeys.projectList(workspaceId));

    await this.auditService.log({
      actorUserId: userId,
      action: 'DELETE',
      resourceType: 'Workspace',
      resourceId: workspaceId,
      workspaceId,
      ipAddress,
    });

    logger.info({ workspaceId, userId }, 'Workspace soft-deleted');
  }

  async listMembers(workspaceId: string, userId: string) {
    await this.assertMember(workspaceId, userId);
    return this.workspaceRepo.listMembers(workspaceId);
  }

  async inviteMember(
    workspaceId: string,
    inviterUserId: string,
    input: InviteMemberInput,
    ipAddress: string,
  ) {
    await this.assertRole(workspaceId, inviterUserId, 'ADMIN');

    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace) throw new NotFoundError('Workspace', workspaceId);

    const inviter = await this.userRepo.findById(inviterUserId);
    if (!inviter) throw new NotFoundError('User', inviterUserId);

    // Check if already a member
    const existingUser = await this.userRepo.findByEmail(input.email);
    if (existingUser) {
      const existingMember = await this.workspaceRepo.findMember(workspaceId, existingUser.id);
      if (existingMember) {
        throw new ConflictError('This user is already a member of the workspace');
      }
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

    const invitation = await this.workspaceRepo.createInvitation({
      workspaceId,
      invitedByUserId: inviterUserId,
      email: input.email,
      role: input.role,
      tokenHash,
      expiresAt,
    });

    this.emailService
      .sendWorkspaceInvitationEmail(input.email, inviter.displayName, workspace.name, rawToken)
      .catch((err) => logger.error({ err }, 'Failed to send invitation email'));

    await this.auditService.log({
      actorUserId: inviterUserId,
      action: 'INVITE',
      resourceType: 'WorkspaceInvitation',
      resourceId: invitation.id,
      workspaceId,
      ipAddress,
      metadata: { email: input.email, role: input.role },
    });

    return { invitationId: invitation.id };
  }

  async acceptInvitation(token: string, userId: string) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const invitation = await this.workspaceRepo.findInvitationByTokenHash(tokenHash);

    if (!invitation) {
      throw new BadRequestError('Invalid or expired invitation token');
    }

    if (invitation.expiresAt < new Date()) {
      await this.workspaceRepo.updateInvitationStatus(invitation.id, 'EXPIRED');
      throw new BadRequestError('This invitation has expired');
    }

    // Add to workspace
    await this.workspaceRepo.addMember(invitation.workspaceId, userId, invitation.role);
    await this.workspaceRepo.updateInvitationStatus(invitation.id, 'ACCEPTED', new Date());

    await this.cache.del(CacheKeys.workspaceMembers(invitation.workspaceId));

    logger.info({ userId, workspaceId: invitation.workspaceId }, 'Invitation accepted');

    return { workspaceId: invitation.workspaceId, role: invitation.role };
  }

  async updateMemberRole(
    workspaceId: string,
    actorId: string,
    targetUserId: string,
    input: UpdateMemberRoleInput,
    ipAddress: string,
  ) {
    const actorMember = await this.assertRole(workspaceId, actorId, 'ADMIN');
    const targetMember = await this.workspaceRepo.findMember(workspaceId, targetUserId);

    if (!targetMember) throw new NotFoundError('WorkspaceMember', targetUserId);

    // Cannot modify a role equal to or higher than your own
    const actorLevel = ROLE_HIERARCHY[actorMember.role as keyof typeof ROLE_HIERARCHY] ?? 0;
    const targetLevel = ROLE_HIERARCHY[targetMember.role as keyof typeof ROLE_HIERARCHY] ?? 0;
    if (targetLevel >= actorLevel) {
      throw new ForbiddenError('You cannot modify the role of a user with an equal or higher role');
    }

    await this.workspaceRepo.updateMemberRole(workspaceId, targetUserId, input.role);
    await this.cache.del(CacheKeys.workspaceMembers(workspaceId));

    await this.auditService.log({
      actorUserId: actorId,
      action: 'ROLE_CHANGE',
      resourceType: 'WorkspaceMember',
      resourceId: targetUserId,
      workspaceId,
      ipAddress,
      metadata: { previousRole: targetMember.role, newRole: input.role },
    });
  }

  async removeMember(
    workspaceId: string,
    actorId: string,
    targetUserId: string,
    ipAddress: string,
  ): Promise<void> {
    const actorMember = await this.assertRole(workspaceId, actorId, 'ADMIN');
    const targetMember = await this.workspaceRepo.findMember(workspaceId, targetUserId);

    if (!targetMember) throw new NotFoundError('WorkspaceMember', targetUserId);

    const actorLevel = ROLE_HIERARCHY[actorMember.role as keyof typeof ROLE_HIERARCHY] ?? 0;
    const targetLevel = ROLE_HIERARCHY[targetMember.role as keyof typeof ROLE_HIERARCHY] ?? 0;

    if (targetLevel >= actorLevel) {
      throw new ForbiddenError('You cannot remove a user with an equal or higher role');
    }

    await this.workspaceRepo.removeMember(workspaceId, targetUserId);
    await this.cache.del(CacheKeys.workspaceMembers(workspaceId));
  }

  // ─── RBAC Helpers ─────────────────────────────────────────────────────────

  private async assertMember(workspaceId: string, userId: string) {
    const member = await this.workspaceRepo.findMember(workspaceId, userId);
    if (!member) throw new ForbiddenError('You are not a member of this workspace');
    return member;
  }

  async assertRole(workspaceId: string, userId: string, minimumRole: keyof typeof ROLE_HIERARCHY) {
    const member = await this.assertMember(workspaceId, userId);
    const memberLevel = ROLE_HIERARCHY[member.role as keyof typeof ROLE_HIERARCHY] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[minimumRole];

    if (memberLevel < requiredLevel) {
      throw new ForbiddenError(
        `This action requires at least the ${minimumRole} role in this workspace`,
      );
    }

    return member;
  }

  async getWorkspaceAuditLog(workspaceId: string, userId: string, page = 1, limit = 20) {
    await this.assertRole(workspaceId, userId, 'ADMIN');
    return this.auditService.auditLogRepo.findByWorkspace(workspaceId, page, limit);
  }

  async searchWorkspace(
    workspaceId: string,
    userId: string,
    query: string,
    filters: { type?: 'Project' | 'Node' | 'Connection' | 'Comment' | 'User'; page?: number; limit?: number } = {}
  ) {
    await this.assertMember(workspaceId, userId);
    const { type, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;
    const results: any[] = [];

    // 1. Projects
    if (!type || type === 'Project') {
      const projects = await prisma.project.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: limit,
        skip,
      });
      results.push(...projects.map(p => ({ type: 'Project', id: p.id, name: p.name, description: p.description, data: p })));
    }

    // 2. Nodes
    if (!type || type === 'Node') {
      const nodes = await prisma.canvasNode.findMany({
        where: {
          project: { workspaceId, deletedAt: null },
          OR: [
            { metadata: { path: ['name'], string_contains: query } },
            { metadata: { path: ['description'], string_contains: query } },
          ],
        },
        include: { project: true },
        take: limit,
        skip,
      });
      results.push(...nodes.map(n => ({ type: 'Node', id: n.id, name: (n.metadata as any).name || '', description: (n.metadata as any).description || '', data: n })));
    }

    // 3. Connections
    if (!type || type === 'Connection') {
      const connections = await prisma.canvasConnection.findMany({
        where: {
          project: { workspaceId, deletedAt: null },
          OR: [
            { label: { contains: query, mode: 'insensitive' } },
          ],
        },
        include: { project: true },
        take: limit,
        skip,
      });
      results.push(...connections.map(c => ({ type: 'Connection', id: c.id, name: c.label || '', description: '', data: c })));
    }

    // 4. Comments
    if (!type || type === 'Comment') {
      const comments = await prisma.comment.findMany({
        where: {
          project: { workspaceId, deletedAt: null },
          body: { contains: query, mode: 'insensitive' },
        },
        include: { author: true },
        take: limit,
        skip,
      });
      results.push(...comments.map(c => ({ type: 'Comment', id: c.id, name: `Comment by ${c.author.displayName}`, description: c.body, data: c })));
    }

    // 5. Users/Members
    if (!type || type === 'User') {
      const members = await prisma.workspaceMember.findMany({
        where: {
          workspaceId,
          user: {
            OR: [
              { displayName: { contains: query, mode: 'insensitive' } },
              { email: { contains: query, mode: 'insensitive' } },
            ],
          },
        },
        include: { user: true },
        take: limit,
        skip,
      });
      results.push(...members.map(m => ({ type: 'User', id: m.userId, name: m.user.displayName, description: m.user.email, data: m.user })));
    }

    return results.slice(0, limit);
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 64);
  }
}
