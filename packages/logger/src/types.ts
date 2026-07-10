import type pino from 'pino';

export type Logger = pino.Logger;

export interface LoggerOptions {
  /** Service name — included in every log line */
  service: string;
  /** Log level: trace | debug | info | warn | error | fatal */
  level?: string;
  /** Whether to enable pretty-printing (development only) */
  pretty?: boolean;
  /** Additional default bindings to attach to every log entry */
  bindings?: Record<string, unknown>;
}

export interface RequestLogData {
  requestId: string;
  method: string;
  url: string;
  userAgent?: string;
  ip?: string;
  userId?: string;
}

export interface ResponseLogData extends RequestLogData {
  statusCode: number;
  responseTime: number;
}
