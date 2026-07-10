/**
 * Project Repository
 */

import type { PrismaClient } from '@prisma/client';

type ProjectVisibility = 'PRIVATE' | 'WORKSPACE' | 'PUBLIC';

export interface CreateProjectData {
  workspaceId: string;
  name: string;
  description?: string | undefined;
  visibility?: ProjectVisibility | undefined;
  createdByUserId: string;
}

export class ProjectRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string) {
    return this.prisma.project.findFirst({
      where: { id, deletedAt: null },
      include: {
        createdBy: { select: { id: true, displayName: true, avatarUrl: true } },
        _count: { select: { nodes: true, connections: true, comments: true } },
      },
    });
  }

  async findByWorkspaceId(workspaceId: string, userId: string) {
    return this.prisma.project.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        OR: [
          { visibility: 'WORKSPACE' },
          { visibility: 'PUBLIC' },
          { createdByUserId: userId },
          { members: { some: { userId } } },
        ],
      },
      include: {
        createdBy: { select: { id: true, displayName: true, avatarUrl: true } },
        _count: { select: { nodes: true, connections: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async create(data: CreateProjectData) {
    const createData = {
      workspaceId: data.workspaceId,
      name: data.name,
      createdByUserId: data.createdByUserId,
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.visibility !== undefined ? { visibility: data.visibility } : {}),
      // Create the default layer
      layers: {
        create: {
          name: 'Default',
          isVisible: true,
          isLocked: false,
          order: 0,
        },
      },
      // Create the initial empty snapshot
      snapshots: {
        create: {
          sequenceNumber: 0,
          integrityHash: 'sha256:empty',
          state: {
            nodes: [],
            connections: [],
            layers: [],
            viewport: { x: 0, y: 0, zoom: 1 },
            version: 0,
          },
          createdBySystem: true,
        },
      },
    };

    return this.prisma.project.create({
      data: createData,
      include: {
        createdBy: { select: { id: true, displayName: true, avatarUrl: true } },
        layers: true,
      },
    });
  }

  async update(
    id: string,
    data: { name?: string | undefined; description?: string | undefined; visibility?: ProjectVisibility | undefined },
  ) {
    const updateData = {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.visibility !== undefined ? { visibility: data.visibility } : {}),
    };

    return this.prisma.project.update({ where: { id }, data: updateData });
  }

  async touchLastAccessed(id: string): Promise<void> {
    await this.prisma.project.update({
      where: { id },
      data: { lastAccessedAt: new Date() },
    });
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.project.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async findMember(projectId: string, userId: string) {
    return this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
  }
}
