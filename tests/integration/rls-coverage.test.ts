import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startTestDatabase, type TestDatabase } from '../helpers/database'
import { IDENTITY_TABLES, NON_TENANT_TABLES } from '../helpers/non-tenant-tables'

/**
 * STRUCTURAL GUARD — generated from the live schema, not from a hand-kept list.
 *
 * Adding a table without row level security fails this suite automatically.
 * That is the whole point: the day someone adds `deliverables` and forgets the
 * policy, CI says so before a cross-tenant leak ever reaches production.
 */

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

  /**
   * ==========================================================================
   * ADR-026, the guarantee that cannot bend: the portal READS the portal.*
   * views and nothing else.
   *
   * One SELECT grant on one base table would hand a client every internal
   * column the views deliberately omit — the health score, the budget, the
   * time spent. This assertion is absolute and stays absolute.
   * ==========================================================================
   */
  it('app_portal can read no base table at all', async () => {
    const { rows } = await admin.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.role_table_grants
        WHERE grantee = 'app_portal' AND table_schema = 'public'
          AND privilege_type IN ('SELECT', 'REFERENCES', 'TRIGGER')`,
    )
    expect(rows).toEqual([])
  })

  /**
   * The portal WRITES through exactly two doors, and the list is pinned here.
   *
   * A write needs a base table: a view over a filtered table is not a sane
   * insert target, and it is the WITH CHECK clause that makes the write safe,
   * not the view. So the grants exist — and this test is what stops a third
   * one appearing without anyone noticing.
   */
  it('app_portal writes through exactly the declared doors', async () => {
    const { rows } = await admin.query<{ table_name: string; privilege_type: string }>(
      `SELECT table_name, privilege_type FROM information_schema.role_table_grants
        WHERE grantee = 'app_portal' AND table_schema = 'public'
        ORDER BY table_name, privilege_type`,
    )

    expect(rows).toEqual([
      // The audit trail is one trail: a client's decision belongs in the same
      // log as everything else, written in the same transaction. INSERT only —
      // a portal session that could SELECT here would read every tenant's
      // history at once, because audit_logs deliberately spans tenants.
      { table_name: 'audit_logs', privilege_type: 'INSERT' },
      // A client's own comment, always shared, always attributed to them.
      { table_name: 'comments', privilege_type: 'INSERT' },
      // A client's own decision on a deliverable that was sent to them.
      { table_name: 'deliverable_reviews', privilege_type: 'INSERT' },
    ])
  })

  /**
   * The decision moves the deliverable, so the portal updates that one row —
   * per COLUMN, which is the one place PostgreSQL's column grants are the
   * right tool. A client can set the status and the approval stamp, and can
   * touch nothing else on the row: not is_client_visible, not the title, not
   * the owner.
   */
  it('lets the portal update only the columns a client decision touches', async () => {
    const { rows } = await admin.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.column_privileges
        WHERE grantee = 'app_portal' AND table_schema = 'public'
          AND table_name = 'deliverables' AND privilege_type = 'UPDATE'
        ORDER BY column_name`,
    )

    expect(rows.map((row) => row.column_name)).toEqual([
      'approved_at',
      'approved_by',
      'status',
      'updated_at',
    ])
  })

  /**
   * The audit trail is append-only for the portal, and unreadable by it. This
   * is asserted on its own because it is the one grant whose SELECT would be
   * catastrophic: `audit_logs` carries no tenant policy for reads.
   */
  it('lets the portal append to the audit trail but never read it', async () => {
    const { rows } = await admin.query<{ privilege_type: string }>(
      `SELECT privilege_type FROM information_schema.role_table_grants
        WHERE grantee = 'app_portal' AND table_name = 'audit_logs'
        ORDER BY privilege_type`,
    )
    expect(rows.map((row) => row.privilege_type)).toEqual(['INSERT'])
  })

  /**
   * `deliverables` is the ONLY row the portal may rewrite, anywhere.
   *
   * (INSERT on a whole table registers per column too, so this looks at UPDATE
   * and DELETE — the verbs that change something that already exists. The two
   * INSERT doors are pinned by the test above.)
   */
  it('lets the portal rewrite nothing but a deliverable’s decision', async () => {
    const { rows } = await admin.query<{ table_name: string; privilege_type: string }>(
      `SELECT DISTINCT table_name, privilege_type FROM information_schema.column_privileges
        WHERE grantee = 'app_portal' AND table_schema = 'public'
          AND privilege_type IN ('UPDATE', 'DELETE')
        ORDER BY table_name, privilege_type`,
    )
    expect(rows).toEqual([{ table_name: 'deliverables', privilege_type: 'UPDATE' }])
  })

  it('app_user cannot touch the identity tables', async () => {
    const { rows } = await admin.query<{ table_name: string; privilege_type: string }>(
      `SELECT table_name, privilege_type FROM information_schema.role_table_grants
        WHERE grantee = 'app_user' AND table_name = ANY ($1)`,
      [IDENTITY_TABLES],
    )
    // Sessions and credential hashes carry no tenant column: a single SELECT
    // would expose every account on the platform.
    expect(rows).toEqual([])
  })

  it('users is readable but never writable by app_user (ADR-028)', async () => {
    const { rows } = await admin.query<{ privilege_type: string }>(
      `SELECT privilege_type FROM information_schema.role_table_grants
        WHERE grantee = 'app_user' AND table_name = 'users'`,
    )
    const privileges = rows.map((row) => row.privilege_type)
    expect(privileges).toContain('SELECT')
    expect(privileges).not.toContain('INSERT')
    expect(privileges).not.toContain('UPDATE')
    expect(privileges).not.toContain('DELETE')
  })

  it('users has a visibility policy so members cannot be enumerated', async () => {
    const { rows } = await admin.query<{ policyname: string; cmd: string }>(
      `SELECT policyname, cmd FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'users' AND 'app_user' = ANY (roles)`,
    )
    expect(rows.map((row) => row.cmd)).toContain('SELECT')
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
