/**
 * Token Service
 *
 * Issues, verifies, and rotates JWT access tokens and refresh tokens.
 * Refresh tokens are stored as hashed values in PostgreSQL.
 */

import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { createLogger } from '@edgeflow/logger';
import type { CacheService } from '../../infrastructure/cache/cache.service.js';
import { UnauthorizedError } from '../../domain/errors/app-errors.js';
import { prisma } from '../../infrastructure/database/prisma.js';
import { config } from '../../infrastructure/config/env.js';

const logger = createLogger({ service: 'token-service' });

export interface IssueTokensOptions {
  userId: string;
  email: string;
  displayName: string;
  sessionId: string;
  rememberMe?: boolean;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export class TokenService {
  constructor(
    private readonly app: FastifyInstance,
    private readonly cache: CacheService,
  ) {}

  async issueTokens(options: IssueTokensOptions): Promise<TokenPair> {
    const { userId, email, displayName, sessionId, rememberMe = false } = options;

    // Access token — short-lived (iat and exp are added automatically by jwt.sign)
    const accessToken = this.app.jwt.sign(
      { sub: userId, email, displayName, sessionId } as any,
      { expiresIn: config.JWT_ACCESS_EXPIRY },
    );

    // Refresh token — random opaque token, stored as hash
    const rawRefreshToken = crypto.randomBytes(48).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

    const expiresAt = new Date(
      Date.now() + parseDurationMs(rememberMe
        ? config.JWT_REFRESH_EXPIRY_REMEMBER_ME
        : config.JWT_REFRESH_EXPIRY),
    );

    await prisma.refreshToken.create({
      data: {
        userId,
        sessionId,
        tokenHash,
        expiresAt,
      },
    });

    return { accessToken, refreshToken: rawRefreshToken };
  }

  async rotateRefreshToken(rawRefreshToken: string): Promise<TokenPair> {
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

    const stored = await prisma.refreshToken.findFirst({
      where: { tokenHash, isRevoked: false },
      include: { user: true },
    });

    if (!stored) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    if (stored.expiresAt < new Date()) {
      await prisma.refreshToken.update({
        where: { id: stored.id },
        data: { isRevoked: true, revokedAt: new Date() },
      });
      throw new UnauthorizedError('Refresh token has expired');
    }

    // Rotate — revoke old token, issue new pair
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { isRevoked: true, revokedAt: new Date() },
    });

    logger.debug({ userId: stored.userId }, 'Refresh token rotated');

    return this.issueTokens({
      userId: stored.userId,
      email: stored.user.email,
      displayName: stored.user.displayName,
      sessionId: stored.sessionId,
    });
  }

  async revokeRefreshToken(rawRefreshToken: string): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

    await prisma.refreshToken.updateMany({
      where: { tokenHash },
      data: { isRevoked: true, revokedAt: new Date() },
    });
  }
}

function parseDurationMs(duration: string): number {
  const value = parseInt(duration, 10);
  const unit = duration.slice(String(value).length);
  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return value;
  }
}
