/**
 * Core Fastify Plugin Registration
 *
 * Registers infrastructure plugins: Swagger, JWT, Cookies.
 * Order matters — JWT must be registered before route plugins.
 */

import type { FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { config } from '../../infrastructure/config/env.js';

export async function registerCorePlugins(app: FastifyInstance): Promise<void> {
  // ─── JWT ────────────────────────────────────────────────────────────────────
  await app.register(fastifyJwt, {
    secret: config.JWT_ACCESS_SECRET,
    sign: {
      expiresIn: config.JWT_ACCESS_EXPIRY,
      algorithm: 'HS256',
    },
    cookie: {
      cookieName: 'access_token',
      signed: false,
    },
  });

  // ─── Cookies ────────────────────────────────────────────────────────────────
  await app.register(fastifyCookie, {
    secret: config.JWT_REFRESH_SECRET,
    hook: 'onRequest',
    parseOptions: {},
  });

  // ─── OpenAPI / Swagger ──────────────────────────────────────────────────────
  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'EdgeFlow API',
        description:
          'Real-Time Collaborative System Design Platform — REST and WebSocket API Documentation',
        version: '1.0.0',
        contact: {
          name: 'EdgeFlow Engineering',
          email: 'engineering@edgeflow.io',
        },
      },
      servers: [{ url: config.API_URL, description: 'Current environment' }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
          cookieAuth: {
            type: 'apiKey',
            in: 'cookie',
            name: 'access_token',
          },
        },
      },
      tags: [
        { name: 'Auth', description: 'Authentication and session management' },
        { name: 'Workspaces', description: 'Workspace management and members' },
        { name: 'Projects', description: 'Project management' },
        { name: 'Canvas', description: 'Canvas nodes, connections, and layers' },
        { name: 'Comments', description: 'Threaded comments and reactions' },
        { name: 'Notifications', description: 'User notifications' },
        { name: 'Search', description: 'Full-text search' },
        { name: 'Export', description: 'Diagram export' },
        { name: 'Admin', description: 'Platform administration' },
        { name: 'Health', description: 'Health and readiness checks' },
      ],
    },
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      persistAuthorization: true,
    },
    staticCSP: true,
  });
}
