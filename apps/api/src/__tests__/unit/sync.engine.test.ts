/**
 * Sync Engine Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncEngine } from '../../application/sync/sync.engine.js';

const mockCache = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  increment: vi.fn(),
};

const mockEventRepo = {
  create: vi.fn(),
  findByProjectIdAndSequenceRange: vi.fn(),
  getLatestSequenceNumber: vi.fn(),
};

const mockSnapshotRepo = {
  create: vi.fn(),
  findById: vi.fn(),
  findLatestByProjectId: vi.fn(),
  findByProjectIdUpToSequence: vi.fn(),
};

// Mock Redis publisher
vi.mock('../../infrastructure/cache/redis.js', () => ({
  getPublisherClient: () => ({
    publish: vi.fn().mockResolvedValue(1),
  }),
}));

// Mock metrics
vi.mock('../../infrastructure/observability/metrics.js', () => ({
  activeRooms: { add: vi.fn() },
  eventsPerSecond: { add: vi.fn() },
  eventBroadcastLatency: { record: vi.fn() },
}));

describe('SyncEngine', () => {
  let syncEngine: SyncEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    syncEngine = new SyncEngine(
      mockCache as any,
      mockEventRepo as any,
      mockSnapshotRepo as any,
    );
  });

  describe('createRoom', () => {
    it('should create a new room and cache it', async () => {
      mockCache.get.mockResolvedValue(null);
      mockCache.set.mockResolvedValue(undefined);

      const room = await syncEngine.createRoom({
        projectId: 'project-1',
        workspaceId: 'workspace-1',
      });

      expect(room.id).toBe('room:project-1');
      expect(room.projectId).toBe('project-1');
      expect(mockCache.set).toHaveBeenCalledOnce();
    });

    it('should return existing room if already cached', async () => {
      const existingRoom = {
        id: 'room:project-1',
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        createdAt: new Date(),
        connectedUserCount: 2,
      };
      mockCache.get.mockResolvedValue(existingRoom);

      const room = await syncEngine.createRoom({
        projectId: 'project-1',
        workspaceId: 'workspace-1',
      });

      expect(room).toEqual(existingRoom);
      expect(mockCache.set).not.toHaveBeenCalled();
    });
  });

  describe('broadcastEvent', () => {
    it('should assign sequence number and persist event before broadcasting', async () => {
      const roomInfo = {
        id: 'room:proj-1',
        projectId: 'proj-1',
        workspaceId: 'ws-1',
        createdAt: new Date(),
        connectedUserCount: 1,
      };
      mockCache.get.mockImplementation((key: string) => {
        if (key.includes('room_info')) return Promise.resolve(roomInfo);
        return Promise.resolve(0);
      });
      mockCache.increment.mockResolvedValue(42);
      mockEventRepo.create.mockResolvedValue(undefined);

      const event = await syncEngine.broadcastEvent({
        roomId: 'room:proj-1',
        event: {
          id: 'evt-1',
          type: 'NodeCreated',
          workspaceId: 'ws-1',
          projectId: 'proj-1',
          userId: 'user-1',
          payload: {},
        },
      });

      expect(event.sequenceNumber).toBe(42);
      expect(mockEventRepo.create).toHaveBeenCalledOnce();
    });
  });

  describe('getPresence', () => {
    it('should return empty presence if not cached', async () => {
      mockCache.get.mockResolvedValue(null);

      const presence = await syncEngine.getPresence('room:test');
      expect(presence.users).toEqual([]);
    });
  });
});
