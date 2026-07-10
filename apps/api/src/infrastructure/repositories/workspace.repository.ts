/**
 * Workspace Repository
 */

import type { PrismaClient } from '@prisma/client';

type WorkspaceRole = 'VIEWER' | 'EDITOR' | 'ADMIN' | 'OWNER';

export interface CreateWorkspaceData {
  name: string;
  slug: string;
  description?: string | undefined;
  logoUrl?: string | undefined;
  ownerId: string;
}

export interface UpdateWorkspaceData {
  name?: string | undefined;
  description?: string | undefined;
  logoUrl?: string | undefined;
}

export class WorkspaceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string) {
    return this.prisma.workspace.findFirst({
      where: { id, deletedAt: null },
      include: {
        owner: { select: { id: true, displayName: true, avatarUrl: true, email: true } },
        _count: { select: { members: true, projects: true } },
      },
    });
  }

  async findBySlug(slug: string) {
    return this.prisma.workspace.findFirst({
      where: { slug, deletedAt: null },
    });
  }

  async findByUserId(userId: string) {
    const workspaces = await this.prisma.workspace.findMany({
      where: {
        deletedAt: null,
        members: { some: { userId } },
      },
      include: {
        owner: { select: { id: true, displayName: true, avatarUrl: true } },
        members: { where: { userId }, select: { role: true } },
        _count: { select: { members: true, projects: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Surface the requesting user's role on each workspace, and drop the
    // internal members array used only to derive it.
    return workspaces.map(({ members, ...workspace }) => ({
      ...workspace,
      role: members[0]?.role,
    }));
  }

  async create(data: CreateWorkspaceData) {
    const createData = {
      name: data.name,
      slug: data.slug,
      ownerId: data.ownerId,
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.logoUrl !== undefined ? { logoUrl: data.logoUrl } : {}),
      members: {
        create: { userId: data.ownerId, role: 'OWNER' as const },
      },
    };

    return this.prisma.workspace.create({
      data: createData,
      include: {
        owner: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });
  }

  async update(id: string, data: UpdateWorkspaceData) {
    const updateData = {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.logoUrl !== undefined ? { logoUrl: data.logoUrl } : {}),
    };

    return this.prisma.workspace.update({ where: { id }, data: updateData });
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.workspace.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async findMember(workspaceId: string, userId: string) {
    return this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
  }

  async listMembers(workspaceId: string) {
    return this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true, email: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }

  async addMember(workspaceId: string, userId: string, role: WorkspaceRole) {
    return this.prisma.workspaceMember.create({
      data: { workspaceId, userId, role },
    });
  }

  async updateMemberRole(workspaceId: string, userId: string, role: WorkspaceRole) {
    return this.prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId } },
      data: { role },
    });
  }

  async removeMember(workspaceId: string, userId: string): Promise<void> {
    await this.prisma.workspaceMember.delete({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
  }

  async createInvitation(data: {
    workspaceId: string;
    invitedByUserId: string;
    email: string;
    role: WorkspaceRole;
    tokenHash: string;
    expiresAt: Date;
  }) {
    return this.prisma.workspaceInvitation.create({ data });
  }

  async findInvitationByTokenHash(tokenHash: string) {
    return this.prisma.workspaceInvitation.findFirst({
      where: { tokenHash, status: 'PENDING' },
      include: {
        workspace: true,
        invitedBy: { select: { id: true, displayName: true } },
      },
    });
  }

  async updateInvitationStatus(
    id: string,
    status: 'ACCEPTED' | 'EXPIRED' | 'REVOKED',
    acceptedAt?: Date | undefined,
  ) {
    const data = {
      status,
      ...(acceptedAt !== undefined ? { acceptedAt } : {}),
    };

    return this.prisma.workspaceInvitation.update({
      where: { id },
      data,
    });
  }
}
