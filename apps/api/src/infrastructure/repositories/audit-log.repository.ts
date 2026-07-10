/**
 * Audit Log Repository
 * Append-only — no update or delete operations.
 */

import type { Prisma, PrismaClient } from '@prisma/client';

type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'INVITE' | 'ACCEPT_INVITE' | 'REVOKE_INVITE' | 'ROLE_CHANGE' | 'PASSWORD_RESET' | 'API_KEY_CREATE' | 'API_KEY_DELETE' | 'EXPORT' | 'RESTORE_VERSION';

export interface CreateAuditLogData {
  actorUserId: string;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  workspaceId?: string | undefined;
  ipAddress: string;
  userAgent?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export class AuditLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateAuditLogData) {
    const createData = {
      actorUserId: data.actorUserId,
      action: data.action,
      resourceType: data.resourceType,
      resourceId: data.resourceId,
      ipAddress: data.ipAddress,
      metadata: (data.metadata ?? {}) as Prisma.InputJsonValue,
      ...(data.workspaceId !== undefined ? { workspaceId: data.workspaceId } : {}),
      ...(data.userAgent !== undefined ? { userAgent: data.userAgent } : {}),
    };

    return this.prisma.auditLog.create({ data: createData });
  }

  async findByActor(actorUserId: string, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { actorUserId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where: { actorUserId } }),
    ]);
    return { items, total };
  }

  async findByWorkspace(workspaceId: string, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: { actor: { select: { id: true, displayName: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where: { workspaceId } }),
    ]);
    return { items, total };
  }
}
