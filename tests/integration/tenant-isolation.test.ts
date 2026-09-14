import { sql } from 'drizzle-orm'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { withPortal, withTenant } from '@/db/tenant'
import {
  newId,
  seedOrganization,
  seedUser,
  startTestDatabase,
  type TestDatabase,
} from '../helpers/database'

/**
 * BEHAVIOURAL GUARD — the one that matters commercially.
 *
 * Everything here runs through withTenant as the real application role, never
 * as the superuser. A cross-tenant read here is the failure mode that ends the
 * product (risk R1), so these tests assert on all four verbs, not just SELECT.
 *
 * Every tenant-scoped table needs a fixture below. A table without one fails
 * the coverage test, which is how a new table gets dragged into this suite.
 */

type Fixture = {
  /** Inserts one row for the given organisation, as the migrator. */
  seed: (
    query: (sql: string, params?: unknown[]) => Promise<unknown>,
    organizationId: string,
  ) => Promise<string>
}

const FIXTURES: Record<string, Fixture> = {
  organizations: {
    seed: async (_query, organizationId) => organizationId,
  },
  memberships: {
    seed: async (query, organizationId) => {
      const id = newId()
      const userId = await seedUser(query, `member-${id}@example.test`)
      await query(
        'INSERT INTO memberships (id, organization_id, user_id, role) VALUES ($1, $2, $3, $4)',
        [id, organizationId, userId, 'manager'],
      )
      return id
    },
  },
  invitations: {
    seed: async (query, organizationId) => {
      const id = newId()
      await query(
        `INSERT INTO invitations (id, organization_id, email, role, token_hash, expires_at)
         VALUES ($1, $2, $3, 'collaborator', $4, now() + interval '7 days')`,
        [id, organizationId, `invite-${id}@example.test`, `hash-${id}`],
      )
      return id
    },
  },
  subscriptions: {
    seed: async (query, organizationId) => {
      const id = newId()
      await query('INSERT INTO subscriptions (id, organization_id) VALUES ($1, $2)', [
        id,
        organizationId,
      ])
      return id
    },
  },
}

/** Drizzle wraps driver errors; the useful message is on the cause. */
function pgMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const cause = error.cause
  return cause instanceof Error ? cause.message : error.message
}

/** Mirrors rls-coverage.test.ts. Kept in sync by the coverage assertion below. */
const NON_TENANT_TABLES = new Set(['users', 'audit_logs', 'schema_migrations'])

describe('tenant isolation', () => {
  let db: TestDatabase
  let admin: Client
  let orgA: { id: string; slug: string }
  let orgB: { id: string; slug: string }
  const rowsA = new Map<string, string>()

  const query = (text: string, params?: unknown[]) => admin.query(text, params)

  beforeAll(async () => {
    db = await startTestDatabase()
    admin = new Client({ connectionString: db.adminUrl })
    await admin.connect()

    orgA = await seedOrganization(query, 'org-a')
    orgB = await seedOrganization(query, 'org-b')

    for (const [table, fixture] of Object.entries(FIXTURES)) {
      rowsA.set(table, await fixture.seed(query, orgA.id))
      await fixture.seed(query, orgB.id)
    }
  }, 180_000)

  afterAll(async () => {
    await admin?.end()
    await db?.stop()
  })

  it('has a fixture for every tenant-scoped table', async () => {
    const { rows } = await admin.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    )
    const missing = rows
      .map((row) => row.tablename)
      .filter((table) => !NON_TENANT_TABLES.has(table))
      .filter((table) => !(table in FIXTURES))

    expect(missing, 'Add a fixture so this table is covered by the isolation matrix').toEqual([])
  })

  describe.each(Object.keys(FIXTURES))('table %s', (table) => {
    const idColumn = table === 'organizations' ? 'id' : 'id'
    const tenantColumn = table === 'organizations' ? 'id' : 'organization_id'

    it('org B cannot SELECT a row of org A', async () => {
      const rowId = rowsA.get(table)
      const found = await withTenant({ organizationId: orgB.id }, (tx) =>
        tx.execute(sql.raw(`SELECT ${idColumn} FROM ${table} WHERE ${idColumn} = '${rowId}'`)),
      )
      expect(found.rows).toEqual([])
    })

    it('org A can SELECT its own row (the test is not vacuous)', async () => {
      const rowId = rowsA.get(table)
      const found = await withTenant({ organizationId: orgA.id }, (tx) =>
        tx.execute(sql.raw(`SELECT ${idColumn} FROM ${table} WHERE ${idColumn} = '${rowId}'`)),
      )
      expect(found.rows).toHaveLength(1)
    })

    it('org B cannot UPDATE a row of org A', async () => {
      const rowId = rowsA.get(table)
      const result = await withTenant({ organizationId: orgB.id }, (tx) =>
        tx.execute(
          sql.raw(
            `UPDATE ${table} SET updated_at = now() WHERE ${idColumn} = '${rowId}' RETURNING ${idColumn}`,
          ),
        ),
      )
      expect(result.rows).toEqual([])
    })

    it('org B cannot DELETE a row of org A', async () => {
      const rowId = rowsA.get(table)
      const result = await withTenant({ organizationId: orgB.id }, (tx) =>
        tx.execute(
          sql.raw(`DELETE FROM ${table} WHERE ${idColumn} = '${rowId}' RETURNING ${idColumn}`),
        ),
      )
      expect(result.rows).toEqual([])

      // And the row is still there when its rightful owner looks.
      const stillThere = await admin.query(`SELECT 1 FROM ${table} WHERE ${idColumn} = $1`, [rowId])
      expect(stillThere.rowCount).toBe(1)
    })

    it('org B cannot INSERT a row labelled as org A', async () => {
      if (table === 'organizations') return

      await expect(
        withTenant({ organizationId: orgB.id }, async (tx) => {
          const fixture = FIXTURES[table]
          if (!fixture) throw new Error(`no fixture for ${table}`)
          return tx.execute(
            sql.raw(
              `INSERT INTO ${table} (${tenantColumn}) VALUES ('${orgA.id}') RETURNING ${idColumn}`,
            ),
          )
        }),
      ).rejects.toThrow()
    })
  })

  it('rejects a context that is not a uuid', async () => {
    await expect(
      withTenant({ organizationId: "' OR '1'='1" }, async () => 'reached'),
    ).rejects.toThrow(/valid organization id/)
  })

  it('never leaks tenant context between pooled connections', async () => {
    // R3: SET LOCAL is transaction-scoped, so interleaved tenants on the same
    // pool must never see each other's rows. Run enough of them to reuse
    // connections several times over.
    const membershipA = rowsA.get('memberships')

    const results = await Promise.all(
      Array.from({ length: 40 }, (_, index) => {
        const org = index % 2 === 0 ? orgA : orgB
        return withTenant({ organizationId: org.id }, async (tx) => {
          const found = await tx.execute(
            sql.raw(`SELECT id FROM memberships WHERE id = '${membershipA}'`),
          )
          return { expected: org.id === orgA.id, actual: found.rows.length === 1 }
        })
      }),
    )

    expect(results.filter((r) => r.expected !== r.actual)).toEqual([])
  })

  it('leaves no role or tenant setting behind on a released connection', async () => {
    await withTenant({ organizationId: orgA.id }, async () => undefined)

    const [role, setting] = await withTenant({ organizationId: orgB.id }, async (tx) => {
      const current = await tx.execute(sql.raw(`SELECT current_user AS role`))
      const org = await tx.execute(
        sql.raw(`SELECT current_setting('app.organization_id', true) AS value`),
      )
      return [current.rows[0], org.rows[0]]
    })

    expect(role).toEqual({ role: 'app_user' })
    expect(setting).toEqual({ value: orgB.id })
  })

  it('refuses a portal context without any client id', async () => {
    await expect(
      withPortal({ organizationId: orgA.id, clientIds: [] }, async () => 'reached'),
    ).rejects.toThrow(/at least one client id/)
  })

  it('gives the portal role no access to base tables (ADR-026)', async () => {
    // The portal reads portal.* views only. Until those views exist (LOT 9),
    // the correct behaviour is a hard permission denial, not a silent result.
    // Drizzle wraps the driver error, so assert on the cause: an empty result
    // set and a denied query must never be confused.
    const error = await withPortal({ organizationId: orgA.id, clientIds: [newId()] }, (tx) =>
      tx.execute(sql.raw('SELECT id FROM memberships')),
    ).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    expect(pgMessage(error)).toMatch(/permission denied/i)
  })

  it('does not grant the login role the union of both role policies', async () => {
    // NOINHERIT is what stops this. With INHERIT, has_privs_of_role would match
    // BOTH app_user and app_portal policies for the same session.
    const client = new Client({ connectionString: db.appUrl })
    await client.connect()
    try {
      await expect(client.query('SELECT id FROM memberships')).rejects.toThrow(/permission denied/i)
    } finally {
      await client.end()
    }
  })
})
