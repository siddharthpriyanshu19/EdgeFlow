/**
 * Auth Controller
 *
 * Thin presentation layer. Parses and validates request input,
 * delegates to AuthService, formats the response.
 * Zero business logic here.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  RegisterSchema,
  LoginSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  validateOrThrow,
} from '@edgeflow/validation';
import type { AuthService } from '../../application/auth/auth.service.js';
import { config, isProduction } from '../../infrastructure/config/env.js';
import type { JwtPayload } from '../hooks/authenticate.js';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction(),
  sameSite: 'lax' as const,
  path: '/',
} as const;

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  async register(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const input = validateOrThrow(RegisterSchema, request.body);
    const result = await this.authService.register(input);

    reply.status(201).send({
      success: true,
      data: {
        message: 'Registration successful. You can now sign in.',
        userId: result.userId,
      },
    });
  }

  async login(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const input = validateOrThrow(LoginSchema, request.body);
    const result = await this.authService.login(
      { ...input, rememberMe: input.rememberMe ?? false },
      {
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? 'unknown',
      },
    );

    const refreshExpiry = input.rememberMe
      ? parseDurationMs(config.JWT_REFRESH_EXPIRY_REMEMBER_ME)
      : parseDurationMs(config.JWT_REFRESH_EXPIRY);

    reply
      .setCookie('refresh_token', result.refreshToken, {
        ...COOKIE_OPTIONS,
        maxAge: Math.floor(refreshExpiry / 1000),
      })
      .setCookie('access_token', result.accessToken, {
        ...COOKIE_OPTIONS,
        maxAge: Math.floor(parseDurationMs(config.JWT_ACCESS_EXPIRY) / 1000),
      })
      .send({
        success: true,
        data: {
          accessToken: result.accessToken,
          user: result.user,
        },
      });
  }

  async logout(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const refreshToken = request.cookies['refresh_token'];
    const user = request.user as JwtPayload;
    await this.authService.logout({
      userId: user.sub,
      sessionId: user.sessionId,
      ...(refreshToken !== undefined ? { refreshToken } : {}),
    });

    reply
      .clearCookie('refresh_token', { path: '/' })
      .clearCookie('access_token', { path: '/' })
      .send({ success: true, data: { message: 'Logged out successfully' } });
  }

  async refresh(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const refreshToken = request.cookies['refresh_token'];
    const result = await this.authService.refreshToken(refreshToken);

    reply
      .setCookie('refresh_token', result.refreshToken, {
        ...COOKIE_OPTIONS,
        maxAge: Math.floor(parseDurationMs(config.JWT_REFRESH_EXPIRY) / 1000),
      })
      .setCookie('access_token', result.accessToken, {
        ...COOKIE_OPTIONS,
        maxAge: Math.floor(parseDurationMs(config.JWT_ACCESS_EXPIRY) / 1000),
      })
      .send({
        success: true,
        data: { accessToken: result.accessToken },
      });
  }

  async forgotPassword(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const input = validateOrThrow(ForgotPasswordSchema, request.body);
    // Always return success to avoid email enumeration
    await this.authService.initiatePasswordReset(input.email);
    reply.send({
      success: true,
      data: {
        message: 'If an account with that email exists, a password reset link has been sent.',
      },
    });
  }

  async resetPassword(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const input = validateOrThrow(ResetPasswordSchema, request.body);
    await this.authService.resetPassword(input.token, input.password);
    reply.send({ success: true, data: { message: 'Password reset successfully' } });
  }

  async getMe(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user as JwtPayload;
    const profile = await this.authService.getUserById(user.sub);
    reply.send({ success: true, data: profile });
  }

  async listSessions(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user as JwtPayload;
    const sessions = await this.authService.listSessions(user.sub);
    reply.send({ success: true, data: sessions });
  }

  async revokeSession(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const user = request.user as JwtPayload;
    const { sessionId } = request.params as { sessionId: string };
    await this.authService.revokeSession(user.sub, sessionId);
    reply.send({ success: true, data: { message: 'Session revoked' } });
  }

  async createApiKey(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user as JwtPayload;
    const { name, expiresAt } = request.body as { name: string; expiresAt?: string };
    const result = await this.authService.createApiKey(user.sub, name, expiresAt ? new Date(expiresAt) : undefined, request.ip);
    reply.status(201).send({ success: true, data: result });
  }

  async listApiKeys(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user as JwtPayload;
    const keys = await this.authService.listApiKeys(user.sub);
    reply.send({ success: true, data: keys });
  }

  async deleteApiKey(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user as JwtPayload;
    const { keyId } = request.params as { keyId: string };
    await this.authService.deleteApiKey(user.sub, keyId, request.ip);
    reply.send({ success: true, data: { message: 'API key deleted' } });
  }

  async getAuditLog(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user as JwtPayload;
    const { page, limit } = request.query as { page?: number; limit?: number };
    const logs = await this.authService.getUserAuditLog(user.sub, page, limit);
    reply.send({ success: true, data: logs });
  }
}


/** Parse duration strings like '15m', '30d', '1h' to milliseconds */
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
