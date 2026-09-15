import { sql } from 'drizzle-orm'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { withPortal, withTenant, withUserLookup } from '@/db/tenant'
import {
  newId,
  seedOrganization,
  seedUser,
  startTestDatabase,
  type TestDatabase,
} from '../helpers/database'
import { NON_TENANT_TABLES, SHARED_TAXONOMY_TABLES } from '../helpers/non-tenant-tables'

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
  /**
   * The column `seed` returns a value for. Defaults to `id`; a pure join table
   * has no surrogate key, and inventing one just to satisfy this suite would be
   * the test shaping the schema rather than the other way round.
   */
  idColumn?: string
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
  clients: {
    seed: async (query, organizationId) => {
      const id = newId()
      await query('INSERT INTO clients (id, organization_id, name, slug) VALUES ($1, $2, $3, $4)', [
        id,
        organizationId,
        `Client ${id}`,
        `client-${id}`,
      ])
      return id
    },
  },
  client_contacts: {
    seed: async (query, organizationId) => {
      const id = newId()
      const clientId = await FIXTURES.clients?.seed(query, organizationId)
      await query(
        `INSERT INTO client_contacts (id, organization_id, client_id, name, email)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, organizationId, clientId, 'Contact', `contact-${id}@example.test`],
      )
      return id
    },
  },
  client_user_access: {
    seed: async (query, organizationId) => {
      const id = newId()
      const clientId = await FIXTURES.clients?.seed(query, organizationId)
      const userId = await seedUser(query, `portal-${id}@example.test`)
      await query(
        `INSERT INTO client_user_access (id, organization_id, user_id, client_id)
         VALUES ($1, $2, $3, $4)`,
        [id, organizationId, userId, clientId],
      )
      return id
    },
  },
  projects: {
    seed: async (query, organizationId) => {
      const id = newId()
      await query(
        'INSERT INTO projects (id, organization_id, name, code) VALUES ($1, $2, $3, $4)',
        [id, organizationId, `Projet ${id}`, `P-${id}`],
      )
      return id
    },
  },
  project_members: {
    seed: async (query, organizationId) => {
      const id = newId()
      const projectId = await FIXTURES.projects?.seed(query, organizationId)
      const userId = await seedUser(query, `member-${id}@example.test`)
      await query(
        'INSERT INTO project_members (id, organization_id, project_id, user_id) VALUES ($1, $2, $3, $4)',
        [id, organizationId, projectId, userId],
      )
      return id
    },
  },
  milestones: {
    seed: async (query, organizationId) => {
      const id = newId()
      const projectId = await FIXTURES.projects?.seed(query, organizationId)
      await query(
        'INSERT INTO milestones (id, organization_id, project_id, title) VALUES ($1, $2, $3, $4)',
        [id, organizationId, projectId, 'Jalon'],
      )
      return id
    },
  },
  results: {
    seed: async (query, organizationId) => {
      const id = newId()
      const projectId = await FIXTURES.projects?.seed(query, organizationId)
      await query(
        `INSERT INTO results (id, organization_id, project_id, recorded_for)
         VALUES ($1, $2, $3, current_date)`,
        [id, organizationId, projectId],
      )
      return id
    },
  },
  result_metrics: {
    seed: async (query, organizationId) => {
      const id = newId()
      const resultId = await FIXTURES.results?.seed(query, organizationId)
      const metricId = newId()
      await query(
        `INSERT INTO metrics (id, organization_id, code, labels)
         VALUES ($1, $2, $3, '{"fr":"M","en":"M"}'::jsonb)`,
        [metricId, organizationId, `metric-${id}`],
      )
      await query(
        `INSERT INTO result_metrics (id, organization_id, result_id, metric_id, field_key, value, recorded_for)
         VALUES ($1, $2, $3, $4, 'value', 1, current_date)`,
        [id, organizationId, resultId, metricId],
      )
      return id
    },
  },
  result_notes: {
    seed: async (query, organizationId) => {
      const id = newId()
      const resultId = await FIXTURES.results?.seed(query, organizationId)
      await query(
        `INSERT INTO result_notes (id, organization_id, result_id, kind, body)
         VALUES ($1, $2, $3, 'observation', 'Note')`,
        [id, organizationId, resultId],
      )
      return id
    },
  },
  deliverables: {
    seed: async (query, organizationId) => {
      const id = newId()
      const projectId = await FIXTURES.projects?.seed(query, organizationId)
      await query(
        'INSERT INTO deliverables (id, organization_id, project_id, title) VALUES ($1, $2, $3, $4)',
        [id, organizationId, projectId, 'Livrable'],
      )
      return id
    },
  },
  deliverable_versions: {
    seed: async (query, organizationId) => {
      const id = newId()
      const deliverableId = await FIXTURES.deliverables?.seed(query, organizationId)
      await query(
        `INSERT INTO deliverable_versions
           (id, organization_id, deliverable_id, version, external_url)
         VALUES ($1, $2, $3, 1, 'https://example.test/v1')`,
        [id, organizationId, deliverableId],
      )
      return id
    },
  },
  deliverable_reviews: {
    seed: async (query, organizationId) => {
      const id = newId()
      const versionId = await FIXTURES.deliverable_versions?.seed(query, organizationId)
      const { rows } = (await query(
        'SELECT deliverable_id FROM deliverable_versions WHERE id = $1',
        [versionId],
      )) as { rows: { deliverable_id: string }[] }
      await query(
        `INSERT INTO deliverable_reviews
           (id, organization_id, deliverable_id, version_id, scope, decision)
         VALUES ($1, $2, $3, $4, 'internal', 'approved')`,
        [id, organizationId, rows[0]?.deliverable_id, versionId],
      )
      return id
    },
  },
  objectives: {
    seed: async (query, organizationId) => {
      const id = newId()
      const projectId = await FIXTURES.projects?.seed(query, organizationId)
      await query(
        'INSERT INTO objectives (id, organization_id, project_id, title) VALUES ($1, $2, $3, $4)',
        [id, organizationId, projectId, 'Objectif'],
      )
      return id
    },
  },
  actions: {
    seed: async (query, organizationId) => {
      const id = newId()
      const projectId = await FIXTURES.projects?.seed(query, organizationId)
      await query(
        'INSERT INTO actions (id, organization_id, project_id, title) VALUES ($1, $2, $3, $4)',
        [id, organizationId, projectId, 'Action'],
      )
      return id
    },
  },
  action_collaborators: {
    seed: async (query, organizationId) => {
      const id = newId()
      const actionId = await FIXTURES.actions?.seed(query, organizationId)
      const userId = await seedUser(query, `collab-${id}@example.test`)
      await query(
        'INSERT INTO action_collaborators (id, organization_id, action_id, user_id) VALUES ($1, $2, $3, $4)',
        [id, organizationId, actionId, userId],
      )
      return id
    },
  },
  comments: {
    seed: async (query, organizationId) => {
      const id = newId()
      const actionId = await FIXTURES.actions?.seed(query, organizationId)
      await query(
        `INSERT INTO comments (id, organization_id, entity_type, entity_id, body)
         VALUES ($1, $2, 'action', $3, 'Note interne')`,
        [id, organizationId, actionId],
      )
      return id
    },
  },
  comment_mentions: {
    // A pure join table: its key is (comment_id, user_id), and the suite is
    // told so rather than the table being given an id it does not need.
    idColumn: 'comment_id',
    seed: async (query, organizationId) => {
      const commentId = await FIXTURES.comments?.seed(query, organizationId)
      const userId = await seedUser(query, `mentioned-${newId()}@example.test`)
      await query(
        'INSERT INTO comment_mentions (organization_id, comment_id, user_id) VALUES ($1, $2, $3)',
        [organizationId, commentId, userId],
      )
      return commentId as string
    },
  },
  attachments: {
    seed: async (query, organizationId) => {
      const id = newId()
      const actionId = await FIXTURES.actions?.seed(query, organizationId)
      const fileId = await FIXTURES.files?.seed(query, organizationId)
      await query(
        `INSERT INTO attachments (id, organization_id, file_id, entity_type, entity_id)
         VALUES ($1, $2, $3, 'action', $4)`,
        [id, organizationId, fileId, actionId],
      )
      return id
    },
  },
  files: {
    seed: async (query, organizationId) => {
      const id = newId()
      await query(
        `INSERT INTO files (id, organization_id, storage_key, filename, mime_type, size_bytes)
         VALUES ($1, $2, $3, 'logo.png', 'image/png', 1024)`,
        [id, organizationId, `${organizationId}/client-logo/${id}.png`],
      )
      return id
    },
  },
  activity_events: {
    seed: async (query, organizationId) => {
      const id = newId()
      await query(
        `INSERT INTO activity_events (id, organization_id, verb, entity_type, entity_id)
         VALUES ($1, $2, 'client.created', 'client', $3)`,
        [id, organizationId, newId()],
      )
      return id
    },
  },
}

/**
 * Tables whose rows no role may rewrite, so the matrix asserts denial instead
 * of absence. The two verbs are tracked separately, because the guarantee is
 * not the same one:
 *
 * · `activity_events` is a history — neither verb, ever. A history that can be
 *   rewritten is not a history.
 * · `result_metrics` is a set of observations — UPDATE is revoked so a number
 *   is never silently changed, but DELETE stays: editing a result replaces its
 *   metric rows inside one transaction, and that is a rewrite of the SET, not
 *   of a measurement.
 */
const NO_UPDATE = new Set([
  'activity_events',
  'result_metrics',
  // A review is a decision that was MADE. "The client approved version 3 on the
  // 14th" has to stay true, or the validation trail is worth nothing. A version
  // is the same kind of fact: correcting it means uploading the next one.
  'deliverable_reviews',
  'deliverable_versions',
])
const NO_DELETE = new Set(['activity_events'])

/** Drizzle wraps driver errors; the useful message is on the cause. */
function pgMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const cause = error.cause
  return cause instanceof Error ? cause.message : error.message
}

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
      .filter((table) => !SHARED_TAXONOMY_TABLES.has(table))
      .filter((table) => !(table in FIXTURES))

    expect(missing, 'Add a fixture so this table is covered by the isolation matrix').toEqual([])
  })

  describe.each(Object.keys(FIXTURES))('table %s', (table) => {
    const idColumn = FIXTURES[table]?.idColumn ?? 'id'
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
      if (NO_UPDATE.has(table)) {
        // No role may update it at all, which is a stronger guarantee than
        // "another tenant may not".
        const error = await withTenant({ organizationId: orgA.id }, (tx) =>
          tx.execute(sql.raw(`UPDATE ${table} SET organization_id = organization_id`)),
        ).catch((caught: unknown) => caught)
        expect(pgMessage(error)).toMatch(/permission denied/i)
        return
      }

      const rowId = rowsA.get(table)
      // A no-op self-assignment, because not every table has updated_at. What
      // is being tested is whether the row is REACHABLE, not what changes.
      const result = await withTenant({ organizationId: orgB.id }, (tx) =>
        tx.execute(
          sql.raw(
            `UPDATE ${table} SET ${tenantColumn} = ${tenantColumn} WHERE ${idColumn} = '${rowId}' RETURNING ${idColumn}`,
          ),
        ),
      )
      expect(result.rows).toEqual([])
    })

    it('org B cannot DELETE a row of org A', async () => {
      if (NO_DELETE.has(table)) {
        const error = await withTenant({ organizationId: orgA.id }, (tx) =>
          tx.execute(sql.raw(`DELETE FROM ${table}`)),
        ).catch((caught: unknown) => caught)
        expect(pgMessage(error)).toMatch(/permission denied/i)
        return
      }

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

  it("does not let one organisation enumerate another's users (ADR-028)", async () => {
    // users has no organization_id — one person, several organisations
    // (ADR-023) — so visibility is granted through a shared membership. This
    // is the test that proves an organisation cannot harvest its competitors'
    // staff directory.
    const outsider = await seedUser(query, `outsider-${newId()}@example.test`)

    const visible = await withTenant({ organizationId: orgA.id }, (tx) =>
      tx.execute(sql.raw(`SELECT id FROM users WHERE id = '${outsider}'`)),
    )
    expect(visible.rows).toEqual([])

    // A member of org A IS visible from org A, so the policy is not simply
    // blocking everything.
    const memberOfA = await admin.query<{ user_id: string }>(
      'SELECT user_id FROM memberships WHERE organization_id = $1 LIMIT 1',
      [orgA.id],
    )
    const known = memberOfA.rows[0]?.user_id
    const found = await withTenant({ organizationId: orgA.id }, (tx) =>
      tx.execute(sql.raw(`SELECT id FROM users WHERE id = '${known}'`)),
    )
    expect(found.rows).toHaveLength(1)

    // And that same member is invisible from org B.
    const fromB = await withTenant({ organizationId: orgB.id }, (tx) =>
      tx.execute(sql.raw(`SELECT id FROM users WHERE id = '${known}'`)),
    )
    expect(fromB.rows).toEqual([])
  })

  it('never lets app_user write a user row', async () => {
    const target = await seedUser(query, `victim-${newId()}@example.test`)
    const error = await withTenant({ organizationId: orgA.id }, (tx) =>
      tx.execute(sql.raw(`UPDATE users SET name = 'hijacked' WHERE id = '${target}'`)),
    ).catch((caught: unknown) => caught)

    expect(pgMessage(error)).toMatch(/permission denied/i)
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

/**
 * The organisation switcher spans tenants by design. These tests exist because
 * a careless version of that feature is the easiest way to punch a hole in the
 * isolation the rest of this file proves.
 */
describe('cross-tenant lookup (migration 0003)', () => {
  let db: TestDatabase
  let admin: Client
  let orgA: { id: string; slug: string }
  let orgB: { id: string; slug: string }
  let person: string
  let outsider: string

  const query = (text: string, params?: unknown[]) => admin.query(text, params)

  beforeAll(async () => {
    db = await startTestDatabase()
    admin = new Client({ connectionString: db.adminUrl })
    await admin.connect()

    orgA = await seedOrganization(query, 'switch-a')
    orgB = await seedOrganization(query, 'switch-b')

    // One person, two organisations — the group/holding case of ADR-023.
    person = await seedUser(query, `switcher-${newId()}@example.test`)
    outsider = await seedUser(query, `outsider-${newId()}@example.test`)

    for (const org of [orgA, orgB]) {
      await query(
        'INSERT INTO memberships (id, organization_id, user_id, role) VALUES ($1, $2, $3, $4)',
        [newId(), org.id, person, 'manager'],
      )
    }
    await query(
      'INSERT INTO memberships (id, organization_id, user_id, role) VALUES ($1, $2, $3, $4)',
      [newId(), orgB.id, outsider, 'manager'],
    )
  }, 180_000)

  afterAll(async () => {
    await admin?.end()
    await db?.stop()
  })

  it('lists exactly the organisations the person belongs to', async () => {
    const rows = await withUserLookup(person, (tx) =>
      tx.execute(sql.raw('SELECT organization_id FROM memberships ORDER BY organization_id')),
    )
    const ids = rows.rows.map((row) => (row as { organization_id: string }).organization_id)
    expect(ids.sort()).toEqual([orgA.id, orgB.id].sort())
  })

  it("never returns another person's memberships", async () => {
    const rows = await withUserLookup(person, (tx) =>
      tx.execute(sql.raw(`SELECT id FROM memberships WHERE user_id = '${outsider}'`)),
    )
    expect(rows.rows).toEqual([])
  })

  it('the lookup policy is INERT inside a tenant transaction', async () => {
    // THE test of this migration. If the policy were written as a plain
    // "a user may see their own memberships", a SELECT inside org A would also
    // return the row from org B, and every count built on memberships would be
    // quietly wrong — and cross-tenant.
    const rows = await withTenant({ organizationId: orgA.id }, (tx) =>
      tx.execute(sql.raw(`SELECT organization_id FROM memberships WHERE user_id = '${person}'`)),
    )
    const ids = rows.rows.map((row) => (row as { organization_id: string }).organization_id)
    expect(ids).toEqual([orgA.id])
  })

  it('exposes no other table through the lookup context', async () => {
    const error = await withUserLookup(person, (tx) =>
      tx.execute(sql.raw('SELECT id FROM invitations')),
    ).catch((caught: unknown) => caught)
    // invitations has no lookup policy, so with no tenant context it is empty —
    // never an error that would hint at its contents.
    if (error instanceof Error) throw error
    expect((error as { rows: unknown[] }).rows).toEqual([])
  })

  it('treats a reused connection with an empty tenant setting as no tenant', async () => {
    // Regression for migration 0004. A custom GUC reverts to the SESSION value
    // after SET LOCAL, which is '' once touched — not NULL. Without nullif(),
    // the next query on that pooled connection raised 22P02 instead of simply
    // matching nothing. Fail-closed, but broken.
    await withTenant({ organizationId: orgA.id }, async () => undefined)

    const rows = await withUserLookup(person, (tx) =>
      tx.execute(sql.raw('SELECT organization_id FROM memberships')),
    )
    expect(rows.rows.length).toBe(2)
  })

  it('rejects a lookup id that is not a uuid', async () => {
    await expect(withUserLookup("' OR '1'='1", async () => 'reached')).rejects.toThrow(
      /valid user id/,
    )
  })
})

/**
 * industries is the one table that crosses the tenant boundary on purpose, so
 * it gets its own tests rather than an exemption. Seeded system rows are shared
 * — that is what a reference table is for — and an organisation's own entries
 * are not.
 */
describe('shared taxonomy (industries)', () => {
  let db: TestDatabase
  let admin: Client
  let orgA: { id: string; slug: string }
  let orgB: { id: string; slug: string }
  let systemRow: string
  let orgARow: string

  const query = (text: string, params?: unknown[]) => admin.query(text, params)

  beforeAll(async () => {
    db = await startTestDatabase()
    admin = new Client({ connectionString: db.adminUrl })
    await admin.connect()

    orgA = await seedOrganization(query, 'tax-a')
    orgB = await seedOrganization(query, 'tax-b')

    systemRow = newId()
    await query(
      `INSERT INTO industries (id, organization_id, code, labels)
       VALUES ($1, NULL, $2, '{"fr":"Distribution","en":"Retail"}'::jsonb)`,
      [systemRow, `retail-${systemRow}`],
    )

    orgARow = newId()
    await query(
      `INSERT INTO industries (id, organization_id, code, labels)
       VALUES ($1, $2, $3, '{"fr":"Secteur maison","en":"House sector"}'::jsonb)`,
      [orgARow, orgA.id, `custom-${orgARow}`],
    )
  }, 180_000)

  afterAll(async () => {
    await admin?.end()
    await db?.stop()
  })

  it('shows seeded system entries to every organisation', async () => {
    for (const org of [orgA, orgB]) {
      const found = await withTenant({ organizationId: org.id }, (tx) =>
        tx.execute(sql.raw(`SELECT id FROM industries WHERE id = '${systemRow}'`)),
      )
      expect(found.rows).toHaveLength(1)
    }
  })

  it("hides one organisation's own entries from another", async () => {
    const fromB = await withTenant({ organizationId: orgB.id }, (tx) =>
      tx.execute(sql.raw(`SELECT id FROM industries WHERE id = '${orgARow}'`)),
    )
    expect(fromB.rows).toEqual([])
  })

  it('lets an organisation see its own entries', async () => {
    const fromA = await withTenant({ organizationId: orgA.id }, (tx) =>
      tx.execute(sql.raw(`SELECT id FROM industries WHERE id = '${orgARow}'`)),
    )
    expect(fromA.rows).toHaveLength(1)
  })

  it('refuses to let an organisation edit a system entry', async () => {
    // Shared means shared: readable by all, owned by none.
    const result = await withTenant({ organizationId: orgA.id }, (tx) =>
      tx.execute(
        sql.raw(`UPDATE industries SET is_active = false WHERE id = '${systemRow}' RETURNING id`),
      ),
    )
    expect(result.rows).toEqual([])
  })

  it('refuses to let an organisation create an entry for another', async () => {
    const error = await withTenant({ organizationId: orgB.id }, (tx) =>
      tx.execute(
        sql.raw(
          `INSERT INTO industries (id, organization_id, code, labels)
           VALUES ('${newId()}', '${orgA.id}', 'stolen', '{}'::jsonb)`,
        ),
      ),
    ).catch((caught: unknown) => caught)

    expect(pgMessage(error)).toMatch(/row-level security|violates/i)
  })
})
