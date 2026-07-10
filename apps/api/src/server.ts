/**
 * EdgeFlow API Server Entry Point
 *
 * Bootstraps OpenTelemetry before any application code so instrumentation
 * captures all spans from startup. Then builds and starts the Fastify server.
 */

// OpenTelemetry MUST be the first import
import './infrastructure/observability/telemetry.js';

import { buildApp } from './app.js';
import { createLogger } from '@edgeflow/logger';
import { config } from './infrastructure/config/env.js';

const logger = createLogger({ service: 'edgeflow-api' });

async function main(): Promise<void> {
  const app = await buildApp({ logger });

  try {
    const address = await app.listen({
      port: config.PORT,
      host: config.HOST,
    });

    logger.info({ address }, 'EdgeFlow API server started');
  } catch (err) {
    logger.fatal({ err }, 'Fatal error starting server');
    process.exit(1);
  }
}

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received — shutting down gracefully');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled promise rejection');
  process.exit(1);
});

main().catch((err) => {
  logger.fatal({ err }, 'Fatal error during bootstrap');
  process.exit(1);
});
