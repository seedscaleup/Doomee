/**
 * Drizzle schema root.
 *
 * Every applicative table must carry organization_id, have ENABLE + FORCE row
 * level security with a policy, and a fixture in the generated tenant-isolation
 * suite (CLAUDE.md rule 11). Three tables are deliberate exceptions, documented
 * in docs/database.md §13: users (global by design — ADR-023), audit_logs
 * (spans tenants) and the Better Auth session tables.
 */
export * from './audit'
export * from './auth'
export * from './enums'
export * from './tenancy'
