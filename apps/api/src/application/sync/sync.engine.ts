/**
 * EdgeFlow Synchronization Engine
 *
 * This is the core of the platform. It is framework-agnostic and
 * can be consumed by any transport (WebSocket, HTTP, tests).
 *
 * Architecture:
 *   - Rooms are scoped to projects
 *   - Every event is assigned a monotonically increasing sequence number (per room)
 *   - Events are persisted to PostgreSQL BEFORE being broadcast
 *   - Events are distributed across WebSocket servers via Redis Pub/Sub
 *   - Snapshots are created every N events to bound replay time
 *   - Presence state is stored in Redis (TTL = 30s, refreshed on every cursor move)
 *
 * Conflict Resolution:
 *   Last-Write-Wins (LWW) by sequence number.
 *   The server is the authority on sequence numbers — clients cannot forge them.
 */

import { v4 as uuidv4 } from 'uuid';
import crypto from 'node:crypto';
import { createLogger } from '@edgeflow/logger';
import type {
  ISyncEngine,
  SyncEngineCreateRoomOptions,
  SyncEngineJoinRoomOptions,
  SyncEngineLeaveRoomOptions,
  SyncEngineBroadcastOptions,
  SyncEngineReplayOptions,
  SyncEngineSnapshotOptions,
  RoomInfo,
} from '@edgeflow/types';
import type { CanvasEvent } from '@edgeflow/types';
import type { UserPresence, RoomPresence } from '@edgeflow/types';
import type { CanvasSnapshot, CanvasState } from '@edgeflow/types';
import type { CacheService } from '../../infrastructure/cache/cache.service.js';
import { CacheKeys, CacheTTL } from '../../infrastructure/cache/cache.service.js';
import { EventRepository } from '../../infrastructure/repositories/event.repository.js';
import { SnapshotRepository } from '../../infrastructure/repositories/snapshot.repository.js';
import { getPublisherClient } from '../../infrastructure/cache/redis.js';
import {
  activeRooms,
  eventsPerSecond,
  eventBroadcastLatency,
} from '../../infrastructure/observability/metrics.js';

const logger = createLogger({ service: 'sync-engine' });

/** After this many events, automatically create a snapshot */
const SNAPSHOT_INTERVAL = 1000;

/** After this many events, automatically create a version checkpoint */
const VERSION_CHECKPOINT_INTERVAL = 100;

/** Redis pub/sub channel prefix for room events */
const ROOM_CHANNEL_PREFIX = 'edgeflow:room:';

export class SyncEngine implements ISyncEngine {
  constructor(
    private readonly cache: CacheService,
    private readonly eventRepo: EventRepository,
    private readonly snapshotRepo: SnapshotRepository,
  ) {}

  // ─── Room Management ────────────────────────────────────────────────────────

  async createRoom(options: SyncEngineCreateRoomOptions): Promise<RoomInfo> {
    const roomId = `room:${options.projectId}`;

    const existing = await this.cache.get<RoomInfo>(this.roomKey(roomId));
    if (existing) return existing;

    const room: RoomInfo = {
      id: roomId,
      projectId: options.projectId,
      workspaceId: options.workspaceId,
      createdAt: new Date(),
      connectedUserCount: 0,
    };

    await this.cache.set(this.roomKey(roomId), room, 86400); // 24h TTL
    activeRooms.add(1);

    logger.info({ roomId, projectId: options.projectId }, 'Room created');
    return room;
  }

  async joinRoom(
    options: SyncEngineJoinRoomOptions,
  ): Promise<{ room: RoomInfo; missedEvents: CanvasEvent[] }> {
    const room = await this.cache.get<RoomInfo>(this.roomKey(options.roomId));
    if (!room) {
      throw new Error(`Room ${options.roomId} does not exist`);
    }

    // Increment connected user count
    await this.cache.increment(this.roomUserCountKey(options.roomId));

    // Determine missed events since last acknowledged sequence number
    let missedEvents: CanvasEvent[] = [];
    if (options.lastSequenceNumber !== undefined) {
      const currentSeq = await this.getCurrentSequenceNumber(room.projectId);
      if (currentSeq > options.lastSequenceNumber) {
        missedEvents = await this.replayEvents({
          roomId: options.roomId,
          fromSequenceNumber: options.lastSequenceNumber + 1,
        });
      }
    }

    logger.info(
      {
        roomId: options.roomId,
        userId: options.userId,
        missedEventCount: missedEvents.length,
      },
      'User joined room',
    );

    return { room, missedEvents };
  }

  async leaveRoom(options: SyncEngineLeaveRoomOptions): Promise<void> {
    const countKey = this.roomUserCountKey(options.roomId);
    const current = await this.cache.get<number>(countKey);
    if (current !== null && current > 0) {
      await this.cache.increment(countKey, -1);
    }

    // Remove presence
    const presenceKey = CacheKeys.roomPresence(options.roomId);
    const presence = await this.cache.get<RoomPresence>(presenceKey);
    if (presence) {
      presence.users = presence.users.filter((u) => u.userId !== options.userId);
      await this.cache.set(presenceKey, presence, CacheTTL.ROOM_PRESENCE);
    }

    logger.debug({ roomId: options.roomId, userId: options.userId }, 'User left room');
  }

  // ─── Event Broadcast ────────────────────────────────────────────────────────

  async broadcastEvent<TPayload>(
    options: SyncEngineBroadcastOptions<TPayload>,
  ): Promise<CanvasEvent<TPayload>> {
    const start = Date.now();
    const room = await this.cache.get<RoomInfo>(this.roomKey(options.roomId));
    if (!room) {
      throw new Error(`Room ${options.roomId} does not exist`);
    }

    // Atomically increment sequence number
    const sequenceNumber = await this.incrementSequenceNumber(room.projectId);

    // Get current canvas version
    const version = await this.getCurrentVersion(room.projectId);

    const event: CanvasEvent<TPayload> = {
      ...options.event,
      sequenceNumber,
      version,
      timestamp: new Date().toISOString(),
    };

    // Persist BEFORE broadcasting — ensures durability
    await this.eventRepo.create(event);

    // Publish to Redis Pub/Sub channel for all WebSocket servers
    const channel = `${ROOM_CHANNEL_PREFIX}${options.roomId}`;
    await getPublisherClient().publish(
      channel,
      JSON.stringify({
        event,
        excludeSocketId: options.excludeSocketId,
      }),
    );

    eventsPerSecond.add(1, { event_type: event.type, room_id: options.roomId });

    const latency = Date.now() - start;
    eventBroadcastLatency.record(latency, { event_type: event.type });

    // Check if we need to create a snapshot
    if (sequenceNumber % SNAPSHOT_INTERVAL === 0) {
      // Fire-and-forget — snapshot creation is async
      logger.info({ roomId: options.roomId, sequenceNumber }, 'Triggering auto-snapshot');
      // Will be triggered via BullMQ worker in Phase 12
    }

    return event;
  }

  async syncEvent<TPayload>(event: CanvasEvent<TPayload>): Promise<void> {
    await this.eventRepo.create(event);
  }

  // ─── Event Replay ───────────────────────────────────────────────────────────

  async replayEvents(options: SyncEngineReplayOptions): Promise<CanvasEvent[]> {
    const room = await this.cache.get<RoomInfo>(this.roomKey(options.roomId));
    if (!room) return [];

    return this.eventRepo.findByProjectIdAndSequenceRange(
      room.projectId,
      options.fromSequenceNumber,
      options.toSequenceNumber,
      options.eventTypes,
    );
  }

  // ─── Snapshots ──────────────────────────────────────────────────────────────

  async createSnapshot(options: SyncEngineSnapshotOptions): Promise<CanvasSnapshot> {
    const integrityHash = this.computeStateHash(options.state);

    const snapshot = await this.snapshotRepo.create({
      projectId: options.projectId,
      sequenceNumber: BigInt(options.sequenceNumber),
      integrityHash,
      state: options.state,
      createdBySystem: options.createdBySystem,
    });

    // Cache the latest snapshot reference
    await this.cache.set(
      CacheKeys.snapshot(options.projectId),
      snapshot,
      CacheTTL.SNAPSHOT,
    );

    logger.info(
      { projectId: options.projectId, sequenceNumber: options.sequenceNumber },
      'Snapshot created',
    );

    return {
      id: snapshot.id,
      projectId: snapshot.projectId,
      sequenceNumber: options.sequenceNumber,
      integrityHash: snapshot.integrityHash,
      state: snapshot.state as unknown as CanvasState,
      createdAt: snapshot.createdAt,
      createdBySystem: snapshot.createdBySystem,
    };
  }

  async restoreSnapshot(snapshotId: string): Promise<CanvasSnapshot> {
    const snapshot = await this.snapshotRepo.findById(snapshotId);
    if (!snapshot) throw new Error(`Snapshot ${snapshotId} not found`);

    // Verify integrity
    const computedHash = this.computeStateHash(snapshot.state as unknown as CanvasState);
    if (computedHash !== snapshot.integrityHash) {
      throw new Error(`Snapshot ${snapshotId} integrity check failed`);
    }

    return {
      id: snapshot.id,
      projectId: snapshot.projectId,
      sequenceNumber: Number(snapshot.sequenceNumber),
      integrityHash: snapshot.integrityHash,
      state: snapshot.state as unknown as CanvasState,
      createdAt: snapshot.createdAt,
      createdBySystem: snapshot.createdBySystem,
    };
  }

  // ─── Presence ───────────────────────────────────────────────────────────────

  async getPresence(roomId: string): Promise<RoomPresence> {
    const cached = await this.cache.get<RoomPresence>(CacheKeys.roomPresence(roomId));
    if (cached) return cached;

    const room = await this.cache.get<RoomInfo>(this.roomKey(roomId));
    return {
      roomId,
      projectId: room?.projectId ?? '',
      users: [],
    };
  }

  async updatePresence(roomId: string, presence: UserPresence): Promise<void> {
    const presenceKey = CacheKeys.roomPresence(roomId);
    const current = await this.cache.get<RoomPresence>(presenceKey);

    const room = await this.cache.get<RoomInfo>(this.roomKey(roomId));
    const roomPresence: RoomPresence = current ?? {
      roomId,
      projectId: room?.projectId ?? '',
      users: [],
    };

    const existingIndex = roomPresence.users.findIndex((u) => u.userId === presence.userId);
    if (existingIndex >= 0) {
      roomPresence.users[existingIndex] = presence;
    } else {
      roomPresence.users.push(presence);
    }

    await this.cache.set(presenceKey, roomPresence, CacheTTL.ROOM_PRESENCE);
  }

  // ─── Room Info ──────────────────────────────────────────────────────────────

  async getRoomInfo(roomId: string): Promise<RoomInfo | null> {
    return this.cache.get<RoomInfo>(this.roomKey(roomId));
  }

  async getActiveRooms(): Promise<RoomInfo[]> {
    // In a real deployment, this would use Redis SCAN to find all room keys
    // For now, the metrics endpoint will track this separately
    return [];
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private roomKey(roomId: string): string {
    return `room_info:${roomId}`;
  }

  private roomUserCountKey(roomId: string): string {
    return `room_user_count:${roomId}`;
  }

  private async getCurrentSequenceNumber(projectId: string): Promise<number> {
    const key = CacheKeys.roomSequence(`room:${projectId}`);
    const value = await this.cache.get<number>(key);
    return value ?? 0;
  }

  private async incrementSequenceNumber(projectId: string): Promise<number> {
    const key = CacheKeys.roomSequence(`room:${projectId}`);
    return this.cache.increment(key);
  }

  private async getCurrentVersion(projectId: string): Promise<number> {
    // Canvas version increments with every batch of significant events
    // For now, it mirrors the sequence number
    return this.getCurrentSequenceNumber(projectId);
  }

  private computeStateHash(state: CanvasState): string {
    const serialized = JSON.stringify(state, Object.keys(state).sort());
    return `sha256:${crypto.createHash('sha256').update(serialized).digest('hex')}`;
  }
}
