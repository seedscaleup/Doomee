import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startTestDatabase, type TestDatabase } from '../helpers/database'

/**
 * STRUCTURAL GUARD — generated from the live schema, not from a hand-kept list.
 *
 * Adding a table without row level security fails this suite automatically.
 * That is the whole point: the day someone adds `deliverables` and forgets the
 * policy, CI says so before a cross-tenant leak ever reaches production.
 */

/**
 * Tables that are deliberately NOT tenant-scoped. Each entry is a decision,
 * and adding one requires editing this file — which is a reviewable act.
 */
const NON_TENANT_TABLES = new Map<string, string>([
  ['users', 'Global by design: one person, one account, across organisations (ADR-023)'],
  ['audit_logs', 'Spans tenants and records platform-level actions; append-only'],
  ['schema_migrations', 'Migration bookkeeping, not application data'],
])

describe('row level security coverage', () => {
  let db: TestDatabase
  let admin: Client
  let tables: string[]

  beforeAll(async () => {
    db = await startTestDatabase()
    admin = new Client({ connectionString: db.adminUrl })
    await admin.connect()

    const { rows } = await admin.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    )
    tables = rows.map((row) => row.tablename)
  }, 180_000)

  afterAll(async () => {
    await admin?.end()
    await db?.stop()
  })

  it('found the tables to check', () => {
    expect(tables.length).toBeGreaterThan(0)
  })

  it('every table is either tenant-scoped or explicitly excepted', async () => {
    const { rows } = await admin.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'organization_id'`,
    )
    const scoped = new Set(rows.map((row) => row.table_name))
    // organizations is the tenant root: its own id is the boundary.
    scoped.add('organizations')

    const unaccounted = tables.filter(
      (table) => !scoped.has(table) && !NON_TENANT_TABLES.has(table),
    )
    expect(unaccounted, 'Add organization_id, or document the exception').toEqual([])
  })

  it('every tenant-scoped table has RLS ENABLED and FORCED', async () => {
    const { rows } = await admin.query<{
      relname: string
      relrowsecurity: boolean
      relforcerowsecurity: boolean
    }>(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'`,
    )

    const offenders = rows
      .filter((row) => !NON_TENANT_TABLES.has(row.relname))
      .filter((row) => !row.relrowsecurity || !row.relforcerowsecurity)
      .map(
        (row) => `${row.relname} (enabled=${row.relrowsecurity} forced=${row.relforcerowsecurity})`,
      )

    // FORCE matters as much as ENABLE: without it the table owner bypasses
    // every policy, and migrations run as the owner.
    expect(offenders).toEqual([])
  })

  it('every tenant-scoped table has a policy for app_user', async () => {
    const { rows } = await admin.query<{ tablename: string }>(
      `SELECT DISTINCT tablename FROM pg_policies
        WHERE schemaname = 'public' AND 'app_user' = ANY (roles)`,
    )
    const withPolicy = new Set(rows.map((row) => row.tablename))

    const missing = tables
      .filter((table) => !NON_TENANT_TABLES.has(table))
      .filter((table) => !withPolicy.has(table))

    expect(missing).toEqual([])
  })

  it('app_portal has no privilege on any base table', async () => {
    const { rows } = await admin.query<{ table_name: string; privilege_type: string }>(
      `SELECT table_name, privilege_type FROM information_schema.role_table_grants
        WHERE grantee = 'app_portal' AND table_schema = 'public'`,
    )
    // ADR-026: the portal reads portal.* views only. A grant here would let a
    // client read internal columns the views deliberately omit.
    expect(rows).toEqual([])
  })

  it('audit_logs is append-only, even for app_user', async () => {
    const { rows } = await admin.query<{ privilege_type: string }>(
      `SELECT privilege_type FROM information_schema.role_table_grants
        WHERE grantee = 'app_user' AND table_name = 'audit_logs'`,
    )
    const privileges = rows.map((row) => row.privilege_type).sort()
    expect(privileges).not.toContain('UPDATE')
    expect(privileges).not.toContain('DELETE')
    expect(privileges).toContain('INSERT')
  })
})
