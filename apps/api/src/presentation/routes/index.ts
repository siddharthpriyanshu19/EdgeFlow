/**
 * Route Registration
 *
 * All route modules are registered with a versioned prefix.
 * Add new route modules here — never inline routes in app.ts.
 */

import type { FastifyInstance } from 'fastify';
import { healthRoutes } from './health.routes.js';
import { authRoutes } from './auth.routes.js';
import { workspaceRoutes } from './workspace.routes.js';
import { projectRoutes } from './project.routes.js';
import { config } from '../../infrastructure/config/env.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  const prefix = `/api/${config.API_VERSION}`;

  // ─── System Routes (no version prefix) ────────────────────────────────────
  await app.register(healthRoutes, { prefix: '/health' });

  // ─── API v1 Routes ─────────────────────────────────────────────────────────
  await app.register(authRoutes, { prefix: `${prefix}/auth` });
  await app.register(workspaceRoutes, { prefix: `${prefix}/workspaces` });
  await app.register(projectRoutes, { prefix: `${prefix}/workspaces/:workspaceId/projects` });
}
