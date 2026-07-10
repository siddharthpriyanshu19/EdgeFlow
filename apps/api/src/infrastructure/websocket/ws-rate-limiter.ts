/**
 * WebSocket Rate Limiter
 *
 * Enforces per-user-per-room event rate limits.
 * Disconnects sockets that exceed the configured burst limit.
 */

import type { Socket } from 'socket.io';
import { createLogger } from '@edgeflow/logger';

const logger = createLogger({ service: 'ws-rate-limiter' });

const MAX_EVENTS_PER_WINDOW = 500;
const WINDOW_MS = 60_000;

interface RateWindow {
  count: number;
  resetAt: number;
}

// In-process store — sufficient for single-instance.
// For multi-instance, move to Redis counters.
const windows = new Map<string, RateWindow>();

export function checkRateLimit(socket: Socket, roomId: string): boolean {
  const key = `${socket.user.sub}:${roomId}`;
  const now = Date.now();

  let window = windows.get(key);

  if (!window || now >= window.resetAt) {
    window = { count: 1, resetAt: now + WINDOW_MS };
    windows.set(key, window);
    return true;
  }

  window.count++;

  if (window.count > MAX_EVENTS_PER_WINDOW) {
    logger.warn(
      { userId: socket.user.sub, roomId, count: window.count },
      'WebSocket rate limit exceeded — disconnecting',
    );
    socket.emit('error', { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many events' });
    socket.disconnect(true);
    return false;
  }

  return true;
}

/** Cleanup stale windows every 5 minutes to prevent memory leaks */
setInterval(() => {
  const now = Date.now();
  for (const [key, window] of windows.entries()) {
    if (now >= window.resetAt) windows.delete(key);
  }
}, 5 * 60 * 1000);
