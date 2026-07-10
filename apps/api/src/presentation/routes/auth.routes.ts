/**
 * Authentication Routes
 *
 * POST /auth/register
 * POST /auth/login
 * POST /auth/logout
 * POST /auth/refresh
 * POST /auth/forgot-password
 * POST /auth/reset-password
 * GET  /auth/me
 * GET  /auth/sessions
 * DELETE /auth/sessions/:sessionId
 */

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../hooks/authenticate.js';
import { AuthController } from '../controllers/auth.controller.js';
import { AuthService } from '../../application/auth/auth.service.js';
import { UserRepository } from '../../infrastructure/repositories/user.repository.js';
import { SessionRepository } from '../../infrastructure/repositories/session.repository.js';
import { TokenService } from '../../application/auth/token.service.js';
import { EmailService } from '../../infrastructure/email/email.service.js';
import { CacheService } from '../../infrastructure/cache/cache.service.js';
import { AuditService } from '../../application/audit/audit.service.js';
import { AuditLogRepository } from '../../infrastructure/repositories/audit-log.repository.js';
import { prisma } from '../../infrastructure/database/prisma.js';
import { getCacheClient } from '../../infrastructure/cache/redis.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Dependency composition root for auth routes
  const cacheService = new CacheService(getCacheClient());
  const userRepo = new UserRepository(prisma);
  const sessionRepo = new SessionRepository(prisma);
  const auditLogRepo = new AuditLogRepository(prisma);
  const tokenService = new TokenService(app, cacheService);
  const emailService = new EmailService();
  const auditService = new AuditService(auditLogRepo);

  const authService = new AuthService(
    userRepo,
    sessionRepo,
    tokenService,
    emailService,
    cacheService,
    auditService,
  );

  const controller = new AuthController(authService);

  // ─── Register ─────────────────────────────────────────────────────────────
  app.post('/register', {
    schema: {
      tags: ['Auth'],
      summary: 'Register a new user account',
      body: {
        type: 'object',
        required: ['email', 'password', 'displayName'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          displayName: { type: 'string', minLength: 2 },
        },
      },
    },
  }, controller.register.bind(controller));

  // ─── Login ────────────────────────────────────────────────────────────────
  app.post('/login', {
    schema: {
      tags: ['Auth'],
      summary: 'Authenticate with email and password',
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
          rememberMe: { type: 'boolean' },
        },
      },
    },
  }, controller.login.bind(controller));

  // ─── Logout ───────────────────────────────────────────────────────────────
  app.post('/logout', {
    preHandler: [authenticate],
    schema: { tags: ['Auth'], summary: 'Revoke current session and clear cookies' },
  }, controller.logout.bind(controller));

  // ─── Refresh Token ────────────────────────────────────────────────────────
  app.post('/refresh', {
    schema: { tags: ['Auth'], summary: 'Issue new access token using refresh token cookie' },
  }, controller.refresh.bind(controller));

  // ─── Forgot Password ──────────────────────────────────────────────────────
  app.post('/forgot-password', {
    schema: {
      tags: ['Auth'],
      summary: 'Send password reset email',
      body: {
        type: 'object',
        required: ['email'],
        properties: { email: { type: 'string', format: 'email' } },
      },
    },
  }, controller.forgotPassword.bind(controller));

  // ─── Reset Password ───────────────────────────────────────────────────────
  app.post('/reset-password', {
    schema: {
      tags: ['Auth'],
      summary: 'Reset password using token from reset email',
      body: {
        type: 'object',
        required: ['token', 'password'],
        properties: {
          token: { type: 'string' },
          password: { type: 'string', minLength: 8 },
        },
      },
    },
  }, controller.resetPassword.bind(controller));

  // ─── Current User ─────────────────────────────────────────────────────────
  app.get('/me', {
    preHandler: [authenticate],
    schema: {
      tags: ['Auth'],
      summary: 'Get the authenticated user profile',
      security: [{ bearerAuth: [] }],
    },
  }, controller.getMe.bind(controller));

  // ─── List Sessions ────────────────────────────────────────────────────────
  app.get('/sessions', {
    preHandler: [authenticate],
    schema: {
      tags: ['Auth'],
      summary: 'List all active sessions for the authenticated user',
      security: [{ bearerAuth: [] }],
    },
  }, controller.listSessions.bind(controller));

  // ─── Revoke Session ───────────────────────────────────────────────────────
  app.delete('/sessions/:sessionId', {
    preHandler: [authenticate],
    schema: {
      tags: ['Auth'],
      summary: 'Revoke a specific session',
      security: [{ bearerAuth: [] }],
    },
  }, controller.revokeSession.bind(controller));

  // ─── API Keys ─────────────────────────────────────────────────────────────
  app.post('/api-keys', {
    preHandler: [authenticate],
    schema: {
      tags: ['Auth'],
      summary: 'Create a new API key',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 128 },
          expiresAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  }, controller.createApiKey.bind(controller));

  app.get('/api-keys', {
    preHandler: [authenticate],
    schema: {
      tags: ['Auth'],
      summary: 'List API keys',
      security: [{ bearerAuth: [] }],
    },
  }, controller.listApiKeys.bind(controller));

  app.delete('/api-keys/:keyId', {
    preHandler: [authenticate],
    schema: {
      tags: ['Auth'],
      summary: 'Delete/revoke an API key',
      security: [{ bearerAuth: [] }],
    },
  }, controller.deleteApiKey.bind(controller));

  // ─── User Audit Logs ───────────────────────────────────────────────────────
  app.get('/audit', {
    preHandler: [authenticate],
    schema: {
      tags: ['Auth'],
      summary: 'Retrieve paginated user audit log',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
    },
  }, controller.getAuditLog.bind(controller));
}

