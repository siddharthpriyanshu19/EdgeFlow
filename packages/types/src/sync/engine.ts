/**
 * Public API contract for the Sync Engine.
 * This interface is the contract between the canvas/clients and the sync infrastructure.
 * It is intentionally decoupled from any transport or framework.
 */

import type { CanvasEvent, CanvasEventType } from '../domain/event.js';
import type { UserPresence, RoomPresence } from '../domain/presence.js';
import type { CanvasSnapshot, CanvasState } from '../domain/canvas.js';

export interface SyncEngineCreateRoomOptions {
  projectId: string;
  workspaceId: string;
}

export interface SyncEngineJoinRoomOptions {
  roomId: string;
  userId: string;
  /** Last acknowledged sequence number from client (for reconnect catch-up) */
  lastSequenceNumber?: number;
}

export interface SyncEngineLeaveRoomOptions {
  roomId: string;
  userId: string;
}

export interface SyncEngineBroadcastOptions<TPayload = unknown> {
  roomId: string;
  event: Omit<CanvasEvent<TPayload>, 'sequenceNumber' | 'version'>;
  /** Socket/connection ID to exclude from broadcast (the sender) */
  excludeSocketId?: string;
}

export interface SyncEngineReplayOptions {
  roomId: string;
  fromSequenceNumber: number;
  toSequenceNumber?: number;
  eventTypes?: CanvasEventType[];
}

export interface SyncEngineSnapshotOptions {
  projectId: string;
  state: CanvasState;
  sequenceNumber: number;
  createdBySystem: boolean;
}

export interface RoomInfo {
  id: string;
  projectId: string;
  workspaceId: string;
  createdAt: Date;
  connectedUserCount: number;
}

/**
 * The ISyncEngine contract.
 * Implementations: RedisSyncEngine (production), InMemorySyncEngine (testing).
 */
export interface ISyncEngine {
  createRoom(options: SyncEngineCreateRoomOptions): Promise<RoomInfo>;
  joinRoom(options: SyncEngineJoinRoomOptions): Promise<{ room: RoomInfo; missedEvents: CanvasEvent[] }>;
  leaveRoom(options: SyncEngineLeaveRoomOptions): Promise<void>;
  broadcastEvent<TPayload>(options: SyncEngineBroadcastOptions<TPayload>): Promise<CanvasEvent<TPayload>>;
  syncEvent<TPayload>(event: CanvasEvent<TPayload>): Promise<void>;
  replayEvents(options: SyncEngineReplayOptions): Promise<CanvasEvent[]>;
  createSnapshot(options: SyncEngineSnapshotOptions): Promise<CanvasSnapshot>;
  restoreSnapshot(snapshotId: string): Promise<CanvasSnapshot>;
  getPresence(roomId: string): Promise<RoomPresence>;
  updatePresence(roomId: string, presence: UserPresence): Promise<void>;
  getRoomInfo(roomId: string): Promise<RoomInfo | null>;
  getActiveRooms(): Promise<RoomInfo[]>;
}
