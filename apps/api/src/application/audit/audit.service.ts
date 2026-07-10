/**
 * Audit Service
 *
 * Writes append-only audit log entries.
 * Called by application services for security-relevant actions.
 */

import type { AuditLogRepository } from '../../infrastructure/repositories/audit-log.repository.js';

type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'INVITE' | 'ACCEPT_INVITE' | 'REVOKE_INVITE' | 'ROLE_CHANGE' | 'PASSWORD_RESET' | 'API_KEY_CREATE' | 'API_KEY_DELETE' | 'EXPORT' | 'RESTORE_VERSION';

export interface AuditLogInput {
  actorUserId: string;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  workspaceId?: string | undefined;
  ipAddress: string;
  userAgent?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export class AuditService {
  constructor(public readonly auditLogRepo: AuditLogRepository) {}

  async log(input: AuditLogInput): Promise<void> {
    await this.auditLogRepo.create({
      actorUserId: input.actorUserId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      workspaceId: input.workspaceId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: input.metadata ?? {},
    });
  }
}

