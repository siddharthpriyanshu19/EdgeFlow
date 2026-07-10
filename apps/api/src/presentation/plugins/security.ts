/**
 * Security Plugin Registration
 *
 * Registers CORS, Helmet (secure HTTP headers), and rate limiting.
 */

import type { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import { config, getCorsOrigins } from '../../infrastructure/config/env.js';
import { getCacheClient } from '../../infrastructure/cache/redis.js';

export async function registerSecurityPlugins(app: FastifyInstance): Promise<void> {
  // ─── CORS ───────────────────────────────────────────────────────────────────
  await app.register(fastifyCors, {
    origin: getCorsOrigins(),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
    credentials: true,
    maxAge: 86400,
  });

  // ─── Helmet ─────────────────────────────────────────────────────────────────
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'none'"],
        frameSrc: ["'none'"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    referrerPolicy: { policy: 'no-referrer' },
  });

  // ─── Rate Limiting ──────────────────────────────────────────────────────────
  await app.register(fastifyRateLimit, {
    global: true,
    max: (req) => {
      // Authenticated users get a higher limit
      const isAuthenticated = req.headers['authorization'] !== undefined;
      return isAuthenticated
        ? config.RATE_LIMIT_AUTHENTICATED_MAX
        : config.RATE_LIMIT_ANONYMOUS_MAX;
    },
    timeWindow: (req) => {
      const isAuthenticated = req.headers['authorization'] !== undefined;
      return isAuthenticated
        ? config.RATE_LIMIT_AUTHENTICATED_WINDOW_MS
        : config.RATE_LIMIT_ANONYMOUS_WINDOW_MS;
    },
    redis: getCacheClient(),
    keyGenerator: (req) => {
      // Prefer user ID if authenticated, fall back to IP
      const user = (req as any).user as { id?: string } | undefined;
      return user?.id ?? req.ip;
    },
    errorResponseBuilder: (req, context) => ({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Rate limit exceeded. Retry after ${context.after}`,
      },
    }),
  });
}
