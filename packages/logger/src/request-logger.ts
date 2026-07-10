import type { Logger, RequestLogData, ResponseLogData } from './types.js';

/**
 * Returns a pair of logging helpers for request/response lifecycle logging.
 * Designed to be framework-agnostic — call logRequest on ingress and logResponse on egress.
 */
export function createRequestLogger(logger: Logger) {
  return {
    logRequest(data: RequestLogData): void {
      logger.info(
        {
          requestId: data.requestId,
          method: data.method,
          url: data.url,
          userAgent: data.userAgent,
          ip: data.ip,
          userId: data.userId,
        },
        'Incoming request',
      );
    },

    logResponse(data: ResponseLogData): void {
      const level =
        data.statusCode >= 500 ? 'error' : data.statusCode >= 400 ? 'warn' : 'info';

      logger[level](
        {
          requestId: data.requestId,
          method: data.method,
          url: data.url,
          statusCode: data.statusCode,
          responseTime: data.responseTime,
          userId: data.userId,
        },
        'Request completed',
      );
    },
  };
}
