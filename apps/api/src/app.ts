/**
 * Fastify Application Factory
 *
 * Registers all plugins, routes, and lifecycle hooks.
 * This function is exported separately from server.ts so integration
 * tests can spin up the app without binding to a port.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import type { Logger } from '@edgeflow/logger';

import { registerCorePlugins } from './presentation/plugins/core.js';
import { registerSecurityPlugins } from './presentation/plugins/security.js';
import { registerRoutes } from './presentation/routes/index.js';
import { registerErrorHandler } from './presentation/hooks/error-handler.js';
import { registerRequestHooks } from './presentation/hooks/request.js';
import { createSocketServer } from './infrastructure/websocket/socket-server.js';
import { registerWebSocketGateway } from './infrastructure/websocket/ws-gateway.js';
import { config } from './infrastructure/config/env.js';

export interface AppOptions {
  logger: Logger;
}

/**
 * Builds and configures the Fastify instance.
 * Does NOT call app.listen() — the server.ts entry point does that.
 */
export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: options.logger as any,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
    disableRequestLogging: false,
    trustProxy: true,
    ajv: {
      customOptions: {
        removeAdditional: false,
        coerceTypes: false,
        allErrors: true,
      },
    },
  });

  // ─── Plugins ───────────────────────────────────────────────────────────────
  await registerCorePlugins(app);
  await registerSecurityPlugins(app);

  // ─── Lifecycle Hooks ───────────────────────────────────────────────────────
  registerRequestHooks(app);
  registerErrorHandler(app);

  // ─── Routes ────────────────────────────────────────────────────────────────
  await registerRoutes(app);

  // ─── WebSocket Gateway ─────────────────────────────────────────────────────
  // Attaches the Socket.IO server to the underlying HTTP server (path '/ws')
  // and registers the realtime collaboration handlers. Without this, clients
  // can never establish a socket, so presence is stuck "offline".
  const io = createSocketServer(app);
  registerWebSocketGateway(io);

  // ─── Ready hook ────────────────────────────────────────────────────────────
  await app.ready();

  return app;
}
