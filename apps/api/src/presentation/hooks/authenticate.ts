import type { FastifyRequest, FastifyReply } from 'fastify';
import { UnauthorizedError } from '../../domain/errors/app-errors.js';
import { prisma } from '../../infrastructure/database/prisma.js';
import bcrypt from 'bcryptjs';

export interface JwtPayload {
  sub: string;
  email: string;
  displayName: string;
  sessionId: string;
  iat: number;
  exp: number;
  isApiKey?: boolean;
}

// Tell @fastify/jwt what our token payload shape is
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

/**
 * Strict authentication — throws 401 if no valid token is present.
 * Use as preHandler on routes that require authentication.
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    // Try Authorization header first, then cookie
    let token: string | undefined;

    const authHeader = request.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else if (request.cookies['access_token']) {
      token = request.cookies['access_token'];
    }

    if (!token) {
      throw new UnauthorizedError('Authentication required');
    }

    // Check if the token is an API key or a JWT
    if (!token.startsWith('ey')) {
      // Treat as API Key: format is <keyId>.<secret>
      const parts = token.split('.');
      if (parts.length !== 2) {
        throw new UnauthorizedError('Invalid API key format');
      }

      const [keyId, secret] = parts;
      if (!keyId || !secret) {
        throw new UnauthorizedError('Invalid API key format');
      }

      const apiKeyRecord = await prisma.apiKey.findUnique({
        where: { id: keyId },
        include: { user: true },
      });

      if (!apiKeyRecord || apiKeyRecord.revokedAt) {
        throw new UnauthorizedError('Invalid or revoked API key');
      }

      if (apiKeyRecord.expiresAt && apiKeyRecord.expiresAt < new Date()) {
        throw new UnauthorizedError('Expired API key');
      }

      const isMatch = await bcrypt.compare(secret!, apiKeyRecord.keyHash);
      if (!isMatch) {
        throw new UnauthorizedError('Invalid API key secret');
      }

      // Update lastUsedAt timestamp asynchronously
      prisma.apiKey.update({
        where: { id: keyId },
        data: { lastUsedAt: new Date() },
      }).catch((err) => {
        // Log error but don't fail authentication
        request.log.error({ err, keyId }, 'Failed to update API key lastUsedAt');
      });

      request.user = {
        sub: apiKeyRecord.userId,
        email: apiKeyRecord.user.email,
        displayName: apiKeyRecord.user.displayName,
        sessionId: `apikey:${keyId}`,
        iat: Math.floor(apiKeyRecord.createdAt.getTime() / 1000),
        exp: apiKeyRecord.expiresAt ? Math.floor(apiKeyRecord.expiresAt.getTime() / 1000) : Math.floor(Date.now() / 1000) + 3600,
        isApiKey: true,
      };
      return;
    }

    const payload = await request.jwtVerify<JwtPayload>();
    request.user = payload;
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      throw err;
    }
    throw new UnauthorizedError('Invalid or expired access token');
  }
}

/**
 * Optional authentication — attaches user if token is valid but does not throw.
 * Use on routes that have both public and authenticated behaviors.
 */
export async function optionalAuthenticate(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  try {
    const authHeader = request.headers['authorization'];
    let token: string | undefined;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else if (request.cookies['access_token']) {
      token = request.cookies['access_token'];
    }

    if (token) {
      if (!token.startsWith('ey')) {
        // Treat as API Key
        const parts = token.split('.');
        if (parts.length === 2) {
          const [keyId, secret] = parts;
          if (!keyId || !secret) return;

          const apiKeyRecord = await prisma.apiKey.findUnique({
            where: { id: keyId },
            include: { user: true },
          });
          if (apiKeyRecord && !apiKeyRecord.revokedAt && (!apiKeyRecord.expiresAt || apiKeyRecord.expiresAt >= new Date())) {
            const isMatch = await bcrypt.compare(secret!, apiKeyRecord.keyHash);
            if (isMatch) {
              request.user = {
                sub: apiKeyRecord.userId,
                email: apiKeyRecord.user.email,
                displayName: apiKeyRecord.user.displayName,
                sessionId: `apikey:${keyId}`,
                iat: Math.floor(apiKeyRecord.createdAt.getTime() / 1000),
                exp: apiKeyRecord.expiresAt ? Math.floor(apiKeyRecord.expiresAt.getTime() / 1000) : Math.floor(Date.now() / 1000) + 3600,
                isApiKey: true,
              };
            }
          }
        }
      } else {
        const payload = await request.jwtVerify<JwtPayload>();
        request.user = payload;
      }
    }
  } catch {
    // Token invalid — treat as unauthenticated, do not throw
  }
}

