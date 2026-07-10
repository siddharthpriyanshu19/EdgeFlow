/**
 * Session Repository
 */

import type { PrismaClient } from '@prisma/client';

export interface CreateSessionData {
  userId: string;
  ipAddress: string;
  userAgent: string;
  expiresAt: Date;
}

export class SessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateSessionData) {
    return this.prisma.session.create({ data });
  }

  async findById(id: string) {
    return this.prisma.session.findUnique({ where: { id } });
  }

  async findActiveByUserId(userId: string) {
    return this.prisma.session.findMany({
      where: {
        userId,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastUsedAt: 'desc' },
    });
  }

  async revoke(sessionId: string): Promise<void> {
    // Deleting is the simplest revocation strategy for sessions
    await this.prisma.session.delete({ where: { id: sessionId } }).catch(() => {
      // Already deleted — not an error
    });

    // Also revoke all refresh tokens for this session
    await this.prisma.refreshToken.updateMany({
      where: { sessionId, isRevoked: false },
      data: { isRevoked: true, revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { userId } });
    await this.prisma.refreshToken.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true, revokedAt: new Date() },
    });
  }

  async touchLastUsed(sessionId: string): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { lastUsedAt: new Date() },
    });
  }
}
