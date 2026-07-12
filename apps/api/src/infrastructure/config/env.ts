/**
 * Environment Configuration
 *
 * All environment variables are validated and parsed here.
 * The rest of the application imports from this module — never from process.env directly.
 * This ensures type safety and surfaces misconfiguration at startup.
 */

import { z } from 'zod';

const EnvSchema = z.object({
  // ─── Application ───────────────────────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  API_VERSION: z.string().default('v1'),

  // ─── Database ──────────────────────────────────────────────────────────────
  DATABASE_URL: z.string().default('file:./dev.db'),
  TURSO_DATABASE_URL: z.string().optional(),
  TURSO_AUTH_TOKEN: z.string().optional(),
  DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(20),

  // ─── Redis ─────────────────────────────────────────────────────────────────
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_PASSWORD: z.string().optional(),

  // ─── JWT ───────────────────────────────────────────────────────────────────
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('30d'),
  JWT_REFRESH_EXPIRY_REMEMBER_ME: z.string().default('90d'),

  // ─── OAuth ─────────────────────────────────────────────────────────────────
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().url().optional(),

  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GITHUB_CALLBACK_URL: z.string().url().optional(),

  // ─── CORS ──────────────────────────────────────────────────────────────────
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  // ─── Email ─────────────────────────────────────────────────────────────────
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  // NOTE: z.coerce.boolean() treats any non-empty string (incl. "false") as true,
  // so parse the string explicitly instead.
  SMTP_SECURE: z
    .string()
    .default('false')
    .transform((v) => v.trim().toLowerCase() === 'true'),
  SMTP_USER: z.string().trim().optional(),
  SMTP_PASS: z.string().trim().optional(),
  EMAIL_FROM: z.string().email().default('noreply@edgeflow.io'),
  EMAIL_FROM_NAME: z.string().default('EdgeFlow'),

  // ─── URLs ──────────────────────────────────────────────────────────────────
  APP_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().default('http://localhost:3001'),

  // ─── Rate Limiting ─────────────────────────────────────────────────────────
  RATE_LIMIT_AUTHENTICATED_MAX: z.coerce.number().int().default(100),
  RATE_LIMIT_AUTHENTICATED_WINDOW_MS: z.coerce.number().int().default(60_000),
  RATE_LIMIT_ANONYMOUS_MAX: z.coerce.number().int().default(20),
  RATE_LIMIT_ANONYMOUS_WINDOW_MS: z.coerce.number().int().default(60_000),

  // ─── Observability ─────────────────────────────────────────────────────────
  OTEL_SERVICE_NAME: z.string().default('edgeflow-api'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  PROMETHEUS_PORT: z.coerce.number().int().default(9090),

  // ─── Encryption ────────────────────────────────────────────────────────────
  ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY must be at least 32 characters').optional(),
});

type Env = z.infer<typeof EnvSchema>;

function loadConfig(): Env {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.errors
      .map((e) => `  • ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`Environment configuration is invalid:\n${formatted}`);
  }

  return result.data;
}

export const config = loadConfig();

export function getCorsOrigins(): string[] {
  return config.CORS_ORIGINS.split(',').map((o) => o.trim().replace(/\/$/, ''));
}

export function isProduction(): boolean {
  return config.NODE_ENV === 'production';
}

export function isDevelopment(): boolean {
  return config.NODE_ENV === 'development';
}
