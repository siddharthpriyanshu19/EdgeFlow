import pino from 'pino';
import type { Logger, LoggerOptions } from './types.js';

/**
 * Creates a production-grade structured logger with Pino.
 *
 * In development (NODE_ENV !== 'production'), pretty-printing is enabled by default.
 * In production, raw JSON is written to stdout for log aggregation (Loki, CloudWatch, etc.).
 */
export function createLogger(options: LoggerOptions): Logger {
  const {
    service,
    level = process.env['LOG_LEVEL'] ?? 'info',
    pretty = process.env['NODE_ENV'] !== 'production',
    bindings = {},
  } = options;

  const transport: pino.TransportSingleOptions | undefined = pretty
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
          messageFormat: '[{service}] {msg}',
        },
      }
    : undefined;

  return pino(
    {
      level,
      base: {
        service,
        env: process.env['NODE_ENV'] ?? 'development',
        ...bindings,
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level(label) {
          return { level: label };
        },
      },
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'body.password', 'password'],
        censor: '[REDACTED]',
      },
    },
    transport ? pino.transport(transport) : undefined,
  );
}
