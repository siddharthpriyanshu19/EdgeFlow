/**
 * Application Metrics
 *
 * Defines all custom Prometheus metrics for EdgeFlow.
 * Import and record metrics from service/gateway layers.
 */

import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('edgeflow-api', '1.0.0');

// ─── WebSocket Metrics ────────────────────────────────────────────────────────

export const activeConnections = meter.createUpDownCounter('ws_active_connections', {
  description: 'Number of active WebSocket connections',
  unit: '1',
});

export const activeRooms = meter.createUpDownCounter('ws_active_rooms', {
  description: 'Number of active collaboration rooms',
  unit: '1',
});

export const eventsPerSecond = meter.createCounter('ws_events_total', {
  description: 'Total WebSocket events processed',
  unit: '1',
});

export const eventBroadcastLatency = meter.createHistogram('ws_event_broadcast_latency_ms', {
  description: 'Event broadcast latency in milliseconds',
  unit: 'ms',
  advice: {
    explicitBucketBoundaries: [5, 10, 25, 50, 100, 250, 500, 1000],
  },
});

// ─── HTTP Metrics ─────────────────────────────────────────────────────────────

export const httpRequestDuration = meter.createHistogram('http_request_duration_ms', {
  description: 'HTTP request duration in milliseconds',
  unit: 'ms',
  advice: {
    explicitBucketBoundaries: [10, 25, 50, 100, 200, 500, 1000, 2500, 5000],
  },
});

export const httpRequestsTotal = meter.createCounter('http_requests_total', {
  description: 'Total HTTP requests',
  unit: '1',
});

// ─── Business Metrics ─────────────────────────────────────────────────────────

export const activeUsers = meter.createUpDownCounter('edgeflow_active_users', {
  description: 'Number of currently authenticated active users',
  unit: '1',
});

export const totalProjects = meter.createCounter('edgeflow_projects_created_total', {
  description: 'Total number of projects created',
  unit: '1',
});

// ─── Cache Metrics ────────────────────────────────────────────────────────────

export const cacheHits = meter.createCounter('cache_hits_total', {
  description: 'Total cache hits',
  unit: '1',
});

export const cacheMisses = meter.createCounter('cache_misses_total', {
  description: 'Total cache misses',
  unit: '1',
});
