import type { PoolConfig } from 'pg'

/**
 * LOT 0 provides the connection shape only. There is no schema and no pool yet.
 *
 * LOT 1 adds:
 *  - three PostgreSQL roles (app_user / app_portal / app_migrator) — ADR-005;
 *  - two separate pools, one per role;
 *  - withTenant(), the ONLY export that hands out a database handle,
 *    opening a transaction and running SET LOCAL app.organization_id.
 *
 * The raw pool must never be exported (CLAUDE.md rule 1).
 */
export type DatabaseRole = 'app_user' | 'app_portal' | 'app_migrator'

export function poolConfig(connectionString: string): PoolConfig {
  return {
    connectionString,
    // Transaction-scoped SET LOCAL stays safe behind a transaction-mode pooler (R3).
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: 'doomee',
  }
}
