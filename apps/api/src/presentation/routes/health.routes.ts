/**
 * Health and Readiness Routes
 *
 * /health/live  — liveness probe (is the process running?)
 * /health/ready — readiness probe (can it serve traffic? checks DB + Redis)
 * /health/metrics — Prometheus metrics (scraped by Prometheus)
 */

import type { FastifyInstance } from 'fastify';
import { prisma } from '../../infrastructure/database/prisma.js';
import { getCacheClient } from '../../infrastructure/cache/redis.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // ─── Liveness ──────────────────────────────────────────────────────────────
  app.get('/live', {
    schema: {
      tags: ['Health'],
      summary: 'Liveness probe',
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            uptime: { type: 'number' },
          },
        },
      },
    },
  }, async (_request, reply) => {
    return reply.send({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // ─── Readiness ─────────────────────────────────────────────────────────────
  app.get('/ready', {
    schema: {
      tags: ['Health'],
      summary: 'Readiness probe — checks all upstream dependencies',
    },
  }, async (_request, reply) => {
    const checks: Record<string, 'ok' | 'error'> = {};
    let isReady = true;

    // Check PostgreSQL
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks['database'] = 'ok';
    } catch {
      checks['database'] = 'error';
      isReady = false;
    }

    // Check Redis
    try {
      const redis = getCacheClient();
      await redis.ping();
      checks['redis'] = 'ok';
    } catch {
      checks['redis'] = 'error';
      isReady = false;
    }

    const statusCode = isReady ? 200 : 503;
    return reply.status(statusCode).send({
      status: isReady ? 'ready' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    });
  });

  // ─── Metrics ───────────────────────────────────────────────────────────────
  // Exposes Prometheus-format metrics. Uses prom-client default registry if
  // available, then falls back to scraping the OTEL exporter sidecar port.
  app.get('/metrics', async (_request, reply) => {
    try {
      // Attempt to use prom-client's default registry (populated by
      // @opentelemetry/exporter-prometheus when it is configured to reuse the
      // default registry).
      const { register } = await import('prom-client');
      const metrics = await register.metrics();
      reply.header('Content-Type', register.contentType);
      return reply.send(metrics);
    } catch {
      // prom-client not configured — fall back to OTEL sidecar exporter
      try {
        const port = process.env['PROMETHEUS_PORT'] ?? '9090';
        const res = await fetch(`http://localhost:${port}/metrics`);
        const body = await res.text();
        reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
        return reply.send(body);
      } catch (err) {
        reply.log.error({ err }, 'Failed to fetch metrics from OTEL exporter');
        return reply.status(503).send(
          '# HELP edgeflow_metrics_unavailable Metrics endpoint temporarily unavailable\n' +
          '# TYPE edgeflow_metrics_unavailable gauge\n' +
          'edgeflow_metrics_unavailable 1\n',
        );
      }
    }
  });
}

