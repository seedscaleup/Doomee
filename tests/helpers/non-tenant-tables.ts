/**
 * Tables that are deliberately NOT tenant-scoped, each with the reason.
 *
 * Single source of truth for both security suites (rls-coverage and
 * tenant-isolation), so the two can never drift apart. Adding an entry here is
 * a reviewable act: it is how a table gets excused from the isolation matrix.
 */
export const NON_TENANT_TABLES = new Map<string, string>([
  ['users', 'Global rows, tenant-scoped visibility through a policy (ADR-028)'],
  ['audit_logs', 'Spans tenants and records platform-level actions; append-only'],
  ['sessions', 'Identity, revoked from app_user entirely'],
  ['accounts', 'Identity and credential hashes, revoked from app_user entirely'],
  ['verifications', 'Identity, revoked from app_user entirely'],
  ['rate_limits', 'Auth rate-limit counters, tenant-less, revoked from app_user'],
  ['schema_migrations', 'Migration bookkeeping, not application data'],
])

/** Identity tables the application role must not be able to touch at all. */
export const IDENTITY_TABLES = ['sessions', 'accounts', 'verifications', 'rate_limits']

/**
 * Reference tables whose SYSTEM rows (organization_id IS NULL) are deliberately
 * readable by every organisation — that is what a seeded taxonomy is for. Their
 * organisation-owned rows are still private, and tenant-isolation.test.ts
 * asserts both halves separately.
 */
export const SHARED_TAXONOMY_TABLES = new Set(['industries'])
