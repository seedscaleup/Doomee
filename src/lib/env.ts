import { z } from 'zod'

/**
 * Environment contract. Validated once, at startup, so a missing or malformed
 * variable fails the boot instead of surfacing as a runtime error later.
 *
 * ADR-021: only plain values — no provider-specific secret manager.
 */
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.url().default('http://localhost:3000'),

  /** The application role: subject to RLS, used by withTenant (app_user/app_portal). */
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  /**
   * Better Auth's connection. The auth tables carry no RLS by design, and
   * sign-in happens before any organisation is known, so this role is not
   * app_user. It is never granted to app_portal.
   */
  DATABASE_AUTH_URL: z.string().min(1, 'DATABASE_AUTH_URL is required'),

  /** Signs session cookies and tokens. At least 32 characters, never committed. */
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),

  /**
   * Object storage. Optional until the storage adapter exists (LOT 3): a
   * variable that is required before anything reads it only blocks the build
   * for no benefit. The adapter refuses to start without them.
   */
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().min(1).optional(),
  S3_BUCKET: z.string().min(1).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  /** Where the filesystem adapter keeps objects when no bucket is configured. */
  STORAGE_DIR: z.string().min(1).default('.doomee-storage'),

  /** Any SMTP endpoint. Unset falls back to the console adapter (ADR-021). */
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('doomee <no-reply@doomee.app>'),

  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
})

export type ServerEnv = z.infer<typeof serverEnvSchema>

export function parseServerEnv(source: NodeJS.ProcessEnv): ServerEnv {
  const parsed = serverEnvSchema.safeParse(source)

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')
    throw new Error(`Invalid environment configuration:\n${issues}`)
  }

  return parsed.data
}

let cached: ServerEnv | undefined

/** Lazily validated so that tooling (lint, codegen) does not require a full .env. */
export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env)
  return cached
}
