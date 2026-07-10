/**
 * Socket.IO Server Factory
 *
 * Creates the Socket.IO server instance and attaches it to the Fastify HTTP server.
 * Uses the Redis adapter for horizontal scaling across multiple instances.
 */

import { Server as SocketIOServer } from 'socket.io';
import type { FastifyInstance } from 'fastify';
import { createAdapter } from '@socket.io/redis-adapter';
import { createLogger } from '@edgeflow/logger';
import { getCorsOrigins } from '../config/env.js';
import { getPublisherClient, getSubscriberClient } from '../cache/redis.js';

const logger = createLogger({ service: 'socket-server' });

let _io: SocketIOServer | null = null;

export function createSocketServer(app: FastifyInstance): SocketIOServer {
  if (_io) return _io;

  _io = new SocketIOServer(app.server, {
    cors: {
      origin: getCorsOrigins(),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 30_000,
    pingInterval: 10_000,
    connectTimeout: 10_000,
    maxHttpBufferSize: 1e6, // 1MB max message size
    // Path used by NGINX proxy_pass for WebSocket upgrade
    path: '/ws',
  });

  // ─── Redis Pub/Sub Adapter ────────────────────────────────────────────────
  // This is what enables horizontal scaling.
  // Any event published to a room on Server A is automatically forwarded
  // to all clients in that room on Server B, C, etc.
  const pubClient = getPublisherClient();
  const subClient = getSubscriberClient();

  _io.adapter(createAdapter(pubClient, subClient));

  logger.info('Socket.IO server initialized with Redis adapter');

  return _io;
}

export function getSocketServer(): SocketIOServer {
  if (!_io) throw new Error('Socket.IO server has not been initialized');
  return _io;
}
