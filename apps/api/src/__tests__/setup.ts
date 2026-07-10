/**
 * Vitest global test setup
 */

import { beforeAll, afterAll, vi } from 'vitest';

// Set test environment variables before any module is imported
process.env['NODE_ENV'] = 'test';
process.env['DATABASE_URL'] = 'postgresql://edgeflow:test@localhost:5432/edgeflow_test';
process.env['REDIS_URL'] = 'redis://localhost:6379';
process.env['JWT_ACCESS_SECRET'] = 'test-access-secret-that-is-at-least-32-chars-long';
process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret-that-is-at-least-32-chars-long';
process.env['SMTP_HOST'] = 'localhost';
process.env['SMTP_PORT'] = '1025';

// ─── Global infrastructure mocks ────────────────────────────────────────────
// Mock BullMQ Queue to prevent Redis ECONNREFUSED in unit tests
vi.mock('bullmq', () => {
  const MockQueue = vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ id: 'mock-job-id' }),
    getJobs: vi.fn().mockResolvedValue([]),
    getJob: vi.fn().mockResolvedValue(null),
    close: vi.fn().mockResolvedValue(undefined),
  }));
  const MockWorker = vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  }));
  return { Queue: MockQueue, Worker: MockWorker };
});

// Mock ioredis to prevent connection attempts
vi.mock('ioredis', () => {
  const MockRedis = vi.fn().mockImplementation(() => ({
    ping: vi.fn().mockResolvedValue('PONG'),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    publish: vi.fn().mockResolvedValue(1),
    subscribe: vi.fn(),
    on: vi.fn(),
    quit: vi.fn().mockResolvedValue('OK'),
    incr: vi.fn().mockResolvedValue(1),
    keys: vi.fn().mockResolvedValue([]),
  }));
  return { default: MockRedis };
});

// Mock Prisma to prevent DB connections in unit tests
vi.mock('../infrastructure/database/prisma.js', () => ({
  prisma: {
    apiKey: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
    },
    auditLog: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({}),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ '1': 1 }]),
    $disconnect: vi.fn(),
  },
}));

beforeAll(() => {
  // Mock OpenTelemetry to prevent actual metric export in tests
  vi.mock('../infrastructure/observability/telemetry.js', () => ({}));
  vi.mock('../infrastructure/observability/metrics.js', () => ({
    activeConnections: { add: vi.fn() },
    activeRooms: { add: vi.fn() },
    eventsPerSecond: { add: vi.fn() },
    eventBroadcastLatency: { record: vi.fn() },
    httpRequestDuration: { record: vi.fn() },
    httpRequestsTotal: { add: vi.fn() },
    activeUsers: { add: vi.fn() },
    totalProjects: { add: vi.fn() },
    cacheHits: { add: vi.fn() },
    cacheMisses: { add: vi.fn() },
  }));
});

afterAll(() => {
  vi.restoreAllMocks();
});
