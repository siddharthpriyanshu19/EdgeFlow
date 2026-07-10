/**
 * WebSocket Gateway
 *
 * Registers all Socket.IO event handlers.
 * This is the entry point for all real-time collaboration events.
 *
 * Event Flow:
 *   1. Client emits event
 *   2. Gateway validates JWT (middleware)
 *   3. Gateway checks RBAC
 *   4. Gateway passes to SyncEngine
 *   5. SyncEngine assigns sequence number, persists, publishes to Redis
 *   6. Redis adapter broadcasts to all connected clients in the room
 */

import type { Server as SocketIOServer, Socket } from 'socket.io';
import { createLogger } from '@edgeflow/logger';
import type { CanvasEvent, CanvasEventType, UserPresence } from '@edgeflow/types';
import { wsAuthMiddleware } from './ws-auth.middleware.js';
import { checkRateLimit } from './ws-rate-limiter.js';
import { SyncEngine } from '../../application/sync/sync.engine.js';
import { EventRepository } from '../repositories/event.repository.js';
import { SnapshotRepository } from '../repositories/snapshot.repository.js';
import { CacheService } from '../cache/cache.service.js';
import { getCacheClient } from '../cache/redis.js';
import { prisma } from '../database/prisma.js';
import { activeConnections } from '../observability/metrics.js';
import { PRESENCE_COLORS } from './presence-colors.js';

const logger = createLogger({ service: 'ws-gateway' });

// ─── Client-to-Server Events ──────────────────────────────────────────────────
export interface ClientToServerEvents {
  'room:join': (data: { projectId: string; lastSequenceNumber?: number }) => void;
  'room:leave': (data: { roomId: string }) => void;
  'canvas:event': (data: Omit<CanvasEvent, 'sequenceNumber' | 'version' | 'userId' | 'timestamp'>) => void;
  'presence:update': (data: Partial<UserPresence>) => void;
  'presence:cursor': (data: { x: number; y: number; roomId: string }) => void;
}

// ─── Server-to-Client Events ──────────────────────────────────────────────────
export interface ServerToClientEvents {
  'room:joined': (data: {
    roomId: string;
    sequenceNumber: number;
    snapshot: unknown | null;
    missedEvents: CanvasEvent[];
    presence: UserPresence[];
  }) => void;
  'room:user_joined': (presence: UserPresence) => void;
  'room:user_left': (data: { userId: string; displayName: string }) => void;
  'canvas:event': (event: CanvasEvent) => void;
  'presence:update': (presence: UserPresence) => void;
  'presence:cursor': (data: { userId: string; x: number; y: number }) => void;
  'error': (data: { code: string; message: string }) => void;
}

export function registerWebSocketGateway(io: SocketIOServer): void {
  const cacheService = new CacheService(getCacheClient());
  const eventRepo = new EventRepository(prisma);
  const snapshotRepo = new SnapshotRepository(prisma);
  const syncEngine = new SyncEngine(cacheService, eventRepo, snapshotRepo);

  // ─── Authentication Middleware ─────────────────────────────────────────────
  io.use(wsAuthMiddleware);

  io.on('connection', async (socket: Socket) => {
    const userId = socket.user.sub;
    const displayName = socket.user.displayName;

    activeConnections.add(1);
    logger.info({ userId, socketId: socket.id }, 'WebSocket client connected');

    // ─── Room: Join ───────────────────────────────────────────────────────────
    socket.on('room:join', async (data) => {
      try {
        const { projectId, lastSequenceNumber } = data;
        const roomId = `room:${projectId}`;

        // TODO: Phase 5 — validate that user has access to this project via RBAC
        // For now, authentication alone grants access (expanded in workspace/project guard)

        // Ensure room exists
        await syncEngine.createRoom({ projectId, workspaceId: '' });

        // Join Socket.IO room
        await socket.join(roomId);

        // Get missed events and room state
        const { missedEvents } = await syncEngine.joinRoom({
          roomId,
          userId,
          lastSequenceNumber,
        });

        // Get latest snapshot for base state
        const snapshot = await snapshotRepo.findLatestByProjectId(projectId);

        // Get presence
        const roomPresence = await syncEngine.getPresence(roomId);

        // Assign a color to this user
        const usedColors = roomPresence.users.map((u) => u.color);
        const userColor = PRESENCE_COLORS.find((c) => !usedColors.includes(c)) ?? PRESENCE_COLORS[0]!;

        // Register this user's presence
        const userPresence: UserPresence = {
          userId,
          displayName,
          avatarUrl: null,
          color: userColor,
          status: 'ONLINE',
          cursor: null,
          viewport: null,
          selectedNodeIds: [],
          selectedConnectionIds: [],
          activeTool: null,
          lastSeenAt: new Date().toISOString(),
        };

        await syncEngine.updatePresence(roomId, userPresence);

        // Notify other room members
        socket.to(roomId).emit('room:user_joined', userPresence);

        // Respond to the joining client
        socket.emit('room:joined', {
          roomId,
          sequenceNumber: snapshot ? Number(snapshot.sequenceNumber) : 0,
          snapshot: snapshot?.state ?? null,
          missedEvents,
          presence: roomPresence.users,
        });

        logger.info({ userId, roomId, missedEventCount: missedEvents.length }, 'User joined room');
      } catch (err) {
        logger.error({ err, userId }, 'Error joining room');
        socket.emit('error', { code: 'JOIN_ERROR', message: 'Failed to join room' });
      }
    });

    // ─── Room: Leave ──────────────────────────────────────────────────────────
    socket.on('room:leave', async (data) => {
      await handleLeaveRoom(socket, data.roomId, userId, displayName, syncEngine);
    });

    // ─── Canvas: Event ────────────────────────────────────────────────────────
    socket.on('canvas:event', async (rawEvent) => {
      try {
        const roomId = `room:${rawEvent.projectId}`;

        // Rate limiting
        if (!checkRateLimit(socket, roomId)) return;

        const event = await syncEngine.broadcastEvent({
          roomId,
          event: {
            id: rawEvent.id,
            type: rawEvent.type as CanvasEventType,
            workspaceId: rawEvent.workspaceId,
            projectId: rawEvent.projectId,
            userId, // Always use server-side userId — never trust client
            timestamp: new Date().toISOString(),
            payload: rawEvent.payload,
          },
          excludeSocketId: socket.id,
        });

        // Fan out to every other member of the room. The Redis adapter
        // propagates this to clients connected to other API instances, so this
        // is what actually delivers the change to collaborators.
        socket.to(roomId).emit('canvas:event', event);

        // Confirm back to sender with server-assigned sequence number
        socket.emit('canvas:event', event);

        logger.debug(
          { userId, eventType: rawEvent.type, seq: event.sequenceNumber },
          'Canvas event processed',
        );
      } catch (err) {
        logger.error({ err, userId }, 'Error processing canvas event');
        socket.emit('error', { code: 'EVENT_ERROR', message: 'Failed to process event' });
      }
    });

    // ─── Presence: Update ─────────────────────────────────────────────────────
    socket.on('presence:update', async (data) => {
      try {
        const rooms = Array.from(socket.rooms).filter((r) => r !== socket.id);
        for (const roomId of rooms) {
          const currentPresence = await syncEngine.getPresence(roomId);
          const user = currentPresence.users.find((u) => u.userId === userId);
          if (!user) continue;

          const updated: UserPresence = {
            ...user,
            ...data,
            userId, // Immutable — server controls
            lastSeenAt: new Date().toISOString(),
          };

          await syncEngine.updatePresence(roomId, updated);
          socket.to(roomId).emit('presence:update', updated);
        }
      } catch (err) {
        logger.error({ err, userId }, 'Error updating presence');
      }
    });

    // ─── Presence: Cursor ─────────────────────────────────────────────────────
    // High-frequency event — throttled on the client side to 30fps
    socket.on('presence:cursor', async (data) => {
      socket.to(data.roomId).emit('presence:cursor', {
        userId,
        x: data.x,
        y: data.y,
      });
    });

    // ─── Disconnect ───────────────────────────────────────────────────────────
    socket.on('disconnect', async (reason) => {
      activeConnections.add(-1);

      const rooms = Array.from(socket.rooms).filter(
        (r) => r !== socket.id && r.startsWith('room:'),
      );

      for (const roomId of rooms) {
        await handleLeaveRoom(socket, roomId, userId, displayName, syncEngine);
      }

      logger.info({ userId, socketId: socket.id, reason }, 'WebSocket client disconnected');
    });
  });
}

async function handleLeaveRoom(
  socket: Socket,
  roomId: string,
  userId: string,
  displayName: string,
  syncEngine: SyncEngine,
): Promise<void> {
  try {
    await socket.leave(roomId);
    await syncEngine.leaveRoom({ roomId, userId });
    socket.to(roomId).emit('room:user_left', { userId, displayName });

    logger.debug({ userId, roomId }, 'User left room');
  } catch (err) {
    logger.error({ err, userId, roomId }, 'Error leaving room');
  }
}
