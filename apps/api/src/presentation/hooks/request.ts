/**
 * Request Lifecycle Hooks
 *
 * Attaches request ID, start time, and response time header to every request.
 */

import type { FastifyInstance } from 'fastify';
import { httpRequestDuration, httpRequestsTotal } from '../../infrastructure/observability/metrics.js';

export function registerRequestHooks(app: FastifyInstance): void {
  // Attach request start time for latency tracking
  app.addHook('onRequest', async (request) => {
    (request as any).startTime = Date.now();
  });

  // Record metrics and attach response time header
  app.addHook('onResponse', async (request, reply) => {
    const startTime = (request as any).startTime as number | undefined;
    const duration = startTime !== undefined ? Date.now() - startTime : 0;

    reply.header('X-Response-Time', `${duration}ms`);
    reply.header('X-Request-ID', request.id);

    httpRequestDuration.record(duration, {
      method: request.method,
      route: request.routeOptions?.url ?? request.url,
      status_code: String(reply.statusCode),
    });

    httpRequestsTotal.add(1, {
      method: request.method,
      route: request.routeOptions?.url ?? request.url,
      status_code: String(reply.statusCode),
    });
  });
}
