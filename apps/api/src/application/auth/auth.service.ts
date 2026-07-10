/**
 * Auth Application Service
 *
 * Orchestrates all authentication use cases.
 * Contains business logic — no HTTP or framework concepts here.
 */

import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { createLogger } from '@edgeflow/logger';
import type { RegisterInput, LoginInput } from '@edgeflow/validation';
import type { UserRepository } from '../../infrastructure/repositories/user.repository.js';
import type { SessionRepository } from '../../infrastructure/repositories/session.repository.js';
import type { TokenService } from './token.service.js';
import type { EmailService } from '../../infrastructure/email/email.service.js';
import type { CacheService } from '../../infrastructure/cache/cache.service.js';
import type { AuditService } from '../audit/audit.service.js';
import {
  UnauthorizedError,
  ConflictError,
  NotFoundError,
  BadRequestError,
} from '../../domain/errors/app-errors.js';
import { CacheKeys, CacheTTL } from '../../infrastructure/cache/cache.service.js';
import { prisma } from '../../infrastructure/database/prisma.js';


const logger = createLogger({ service: 'auth-service' });

const BCRYPT_ROUNDS = 12;

export interface LoginContext {
  ipAddress: string;
  userAgent: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResult extends AuthTokens {
  user: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
    status: string;
  };
}

export class AuthService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly sessionRepo: SessionRepository,
    private readonly tokenService: TokenService,
    private readonly emailService: EmailService,
    private readonly cache: CacheService,
    private readonly auditService: AuditService,
  ) {}

  async register(input: RegisterInput): Promise<{ userId: string }> {
    const existing = await this.userRepo.findByEmail(input.email);
    if (existing) {
      throw new ConflictError('An account with this email address already exists');
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    const user = await this.userRepo.create({
      email: input.email.toLowerCase().trim(),
      displayName: input.displayName.trim(),
      passwordHash,
      provider: 'EMAIL',
      status: 'VERIFIED',
    });

    logger.info({ userId: user.id }, 'User registered');

    await this.auditService.log({
      actorUserId: user.id,
      action: 'CREATE',
      resourceType: 'User',
      resourceId: user.id,
      ipAddress: '0.0.0.0',
      metadata: { email: user.email },
    });

    return { userId: user.id };
  }

  async login(input: LoginInput, context: LoginContext): Promise<LoginResult> {
    const user = await this.userRepo.findByEmail(input.email.toLowerCase().trim());
    if (!user || !user.passwordHash) {
      // Use constant-time comparison even for missing users
      await bcrypt.compare('dummy', '$2b$12$dummy_hash_to_prevent_timing_attacks');
      throw new UnauthorizedError('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);
    if (!isPasswordValid) {
      logger.warn({ email: input.email }, 'Failed login attempt');
      throw new UnauthorizedError('Invalid email or password');
    }

    if (user.status === 'SUSPENDED') {
      throw new UnauthorizedError('Your account has been suspended. Please contact support.');
    }

    // Create session
    const expiresAt = new Date(
      Date.now() +
        (input.rememberMe
          ? 90 * 24 * 60 * 60 * 1000
          : 30 * 24 * 60 * 60 * 1000),
    );

    const session = await this.sessionRepo.create({
      userId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      expiresAt,
    });

    // Issue tokens
    const { accessToken, refreshToken } = await this.tokenService.issueTokens({
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      sessionId: session.id,
      rememberMe: input.rememberMe,
    });

    logger.info({ userId: user.id, sessionId: session.id }, 'User logged in');

    await this.auditService.log({
      actorUserId: user.id,
      action: 'LOGIN',
      resourceType: 'Session',
      resourceId: session.id,
      ipAddress: context.ipAddress,
      metadata: { userAgent: context.userAgent },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        status: user.status,
      },
    };
  }

/**
 * Auth Application Service — logout accepts optional refreshToken
 */
  async logout(options: {
    userId: string;
    sessionId: string;
    refreshToken?: string | undefined;
  }): Promise<void> {
    await this.sessionRepo.revoke(options.sessionId);
    if (options.refreshToken) {
      await this.tokenService.revokeRefreshToken(options.refreshToken);
    }

    // Invalidate user cache
    const user = await this.userRepo.findById(options.userId);
    if (user) {
      await this.cache.del(CacheKeys.user(options.userId), CacheKeys.userByEmail(user.email));
    }

    logger.info({ userId: options.userId, sessionId: options.sessionId }, 'User logged out');
  }

  async refreshToken(rawRefreshToken: string | undefined): Promise<AuthTokens> {
    if (!rawRefreshToken) {
      throw new UnauthorizedError('Refresh token is missing');
    }

    return this.tokenService.rotateRefreshToken(rawRefreshToken);
  }

  async initiatePasswordReset(email: string): Promise<void> {
    const user = await this.userRepo.findByEmail(email.toLowerCase().trim());

    // Always resolve — never reveal whether the email exists
    if (!user) {
      logger.debug({ email }, 'Password reset requested for non-existent email');
      return;
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    await this.cache.set(
      CacheKeys.passwordReset(resetToken),
      { userId: user.id },
      CacheTTL.PASSWORD_RESET,
    );

    this.emailService.sendPasswordResetEmail(user.email, user.displayName, resetToken)
      .catch((err) => logger.error({ err, userId: user.id }, 'Failed to send password reset email'));
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const cacheKey = CacheKeys.passwordReset(token);
    const cached = await this.cache.get<{ userId: string }>(cacheKey);

    if (!cached) {
      throw new BadRequestError('Invalid or expired password reset token');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await this.userRepo.update(cached.userId, { passwordHash });

    // Invalidate all refresh tokens for this user
    await this.sessionRepo.revokeAllForUser(cached.userId);
    await this.cache.del(cacheKey);
    await this.cache.invalidatePattern(`refresh_token:${cached.userId}:*`);

    logger.info({ userId: cached.userId }, 'Password reset');
  }

  async getUserById(userId: string) {
    const cached = await this.cache.get(CacheKeys.user(userId));
    if (cached) return cached;

    const user = await this.userRepo.findById(userId);
    if (!user) throw new NotFoundError('User', userId);

    const profile = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      status: user.status,
      provider: user.provider,
      createdAt: user.createdAt,
    };

    await this.cache.set(CacheKeys.user(userId), profile, CacheTTL.USER);
    return profile;
  }

  async listSessions(userId: string) {
    return this.sessionRepo.findActiveByUserId(userId);
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session || session.userId !== userId) {
      throw new NotFoundError('Session', sessionId);
    }
    await this.sessionRepo.revoke(sessionId);
  }

  async createApiKey(userId: string, name: string, expiresAt?: Date, ipAddress?: string): Promise<{ id: string; key: string; name: string; expiresAt: Date | null }> {
    const rawSecret = crypto.randomBytes(32).toString('hex');
    const secretHash = await bcrypt.hash(rawSecret, BCRYPT_ROUNDS);
    const createData = {
      userId,
      name,
      keyHash: secretHash,
      ...(expiresAt !== undefined ? { expiresAt } : {}),
    };

    const apiKey = await prisma.apiKey.create({
      data: createData,
    });

    await this.auditService.log({
      actorUserId: userId,
      action: 'API_KEY_CREATE',
      resourceType: 'ApiKey',
      resourceId: apiKey.id,
      ipAddress: ipAddress || '0.0.0.0',
      metadata: { name },
    });

    return {
      id: apiKey.id,
      key: `${apiKey.id}.${rawSecret}`,
      name: apiKey.name,
      expiresAt: apiKey.expiresAt,
    };
  }

  async listApiKeys(userId: string) {
    return prisma.apiKey.findMany({
      where: {
        userId,
        revokedAt: null,
      },
      select: {
        id: true,
        name: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  }

  async deleteApiKey(userId: string, keyId: string, ipAddress?: string): Promise<void> {
    const apiKey = await prisma.apiKey.findFirst({
      where: {
        id: keyId,
        userId,
      },
    });

    if (!apiKey) {
      throw new NotFoundError('ApiKey', keyId);
    }

    await prisma.apiKey.update({
      where: { id: keyId },
      data: { revokedAt: new Date() },
    });

    await this.auditService.log({
      actorUserId: userId,
      action: 'API_KEY_DELETE',
      resourceType: 'ApiKey',
      resourceId: keyId,
      ipAddress: ipAddress || '0.0.0.0',
    });
  }

  async getUserAuditLog(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: { actorUserId: userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where: { actorUserId: userId } }),
    ]);
    return { items, total, page, limit };
  }
}
