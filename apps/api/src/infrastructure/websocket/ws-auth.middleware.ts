/**
 * WebSocket Authentication Middleware
 *
 * Validates the JWT access token on every new Socket.IO connection.
 * Rejects unauthenticated connections before they can join any room.
 */

import type { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { createLogger } from '@edgeflow/logger';
import { config } from '../config/env.js';
import type { JwtPayload } from '../../presentation/hooks/authenticate.js';

const logger = createLogger({ service: 'ws-auth' });

// Augment Socket type to carry authenticated user
declare module 'socket.io' {
  interface Socket {
    user: JwtPayload;
  }
}

export function wsAuthMiddleware(socket: Socket, next: (err?: Error) => void): void {
  try {
    // Token can be passed via handshake auth, query string, or Authorization header
    const token =
      (socket.handshake.auth['token'] as string | undefined) ??
      (socket.handshake.query['token'] as string | undefined) ??
      socket.handshake.headers['authorization']?.replace('Bearer ', '');

    if (!token) {
      logger.warn({ socketId: socket.id, ip: socket.handshake.address }, 'WS connection rejected: no token');
      return next(new Error('Authentication required'));
    }

    const payload = jwt.verify(token, config.JWT_ACCESS_SECRET) as JwtPayload;
    socket.user = payload;

    logger.debug({ userId: payload.sub, socketId: socket.id }, 'WS connection authenticated');
    next();
  } catch {
    logger.warn({ socketId: socket.id }, 'WS connection rejected: invalid token');
    next(new Error('Invalid or expired access token'));
  }
}
