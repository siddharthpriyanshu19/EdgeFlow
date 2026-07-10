/**
 * Global Error Handler
 *
 * Translates domain errors and library errors into consistent API error responses.
 * Never exposes stack traces or internal details in production.
 */

import type { FastifyInstance, FastifyError } from 'fastify';
import type { ApiErrorResponse } from '@edgeflow/types';
import { ValidationError } from '@edgeflow/validation';
import {
  AppError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
} from '../../domain/errors/app-errors.js';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | Error, request, reply) => {
    const requestId = request.id as string;
    const isProduction = process.env['NODE_ENV'] === 'production';

    // ─── Domain Errors ────────────────────────────────────────────────────────
    if (error instanceof NotFoundError) {
      return reply.status(404).send(makeErrorResponse('NOT_FOUND', error.message, requestId));
    }

    if (error instanceof UnauthorizedError) {
      return reply.status(401).send(makeErrorResponse('UNAUTHORIZED', error.message, requestId));
    }

    if (error instanceof ForbiddenError) {
      return reply.status(403).send(makeErrorResponse('FORBIDDEN', error.message, requestId));
    }

    if (error instanceof ConflictError) {
      return reply.status(409).send(makeErrorResponse('CONFLICT', error.message, requestId));
    }

    if (error instanceof ValidationError) {
      return reply.status(422).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: error.errors,
        },
        requestId,
      } satisfies ApiErrorResponse);
    }

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(
        makeErrorResponse(error.code, error.message, requestId),
      );
    }

    // ─── Fastify Built-in Errors ───────────────────────────────────────────────
    const fastifyError = error as FastifyError;
    if (fastifyError.statusCode) {
      if (fastifyError.statusCode === 401) {
        return reply
          .status(401)
          .send(makeErrorResponse('UNAUTHORIZED', 'Authentication required', requestId));
      }
      if (fastifyError.statusCode === 429) {
        return reply
          .status(429)
          .send(makeErrorResponse('RATE_LIMIT_EXCEEDED', fastifyError.message, requestId));
      }
      if (fastifyError.statusCode < 500) {
        return reply
          .status(fastifyError.statusCode)
          .send(makeErrorResponse('BAD_REQUEST', fastifyError.message, requestId));
      }
    }

    // ─── Unhandled Errors ─────────────────────────────────────────────────────
    request.log.error({ err: error, requestId }, 'Unhandled error');

    const message = isProduction
      ? 'An unexpected error occurred. Please try again later.'
      : error.message;

    return reply.status(500).send(makeErrorResponse('INTERNAL_SERVER_ERROR', message, requestId));
  });

  // 404 handler for unmatched routes
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send(
      makeErrorResponse(
        'NOT_FOUND',
        `Route ${request.method} ${request.url} not found`,
        request.id as string,
      ),
    );
  });
}

function makeErrorResponse(
  code: string,
  message: string,
  requestId: string,
): ApiErrorResponse {
  return {
    success: false,
    error: { code, message },
    requestId,
  };
}
