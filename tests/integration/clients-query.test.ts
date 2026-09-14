import { sql } from 'drizzle-orm'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { withTenant } from '@/db/tenant'
import {
  newId,
  seedOrganization,
  seedUser,
  startTestDatabase,
  type TestDatabase,
} from '../helpers/database'

/**
 * The client list query, run as app_user against real policies.
 *
 * It joins users and industries, both of which have their own row level
 * security, and counts contacts in a correlated subquery that is filtered too.
 * Each of those is a place the query can silently return nothing — or fail.
 */
describe('listing clients as app_user', () => {
  let db: TestDatabase
  let admin: Client
  let org: { id: string; slug: string }
  let ownerId: string

  const query = (text: string, params?: unknown[]) => admin.query(text, params)

  beforeAll(async () => {
    db = await startTestDatabase()
    admin = new Client({ connectionString: db.adminUrl })
    await admin.connect()

    org = await seedOrganization(query, 'listing')
    ownerId = await seedUser(query, `owner-${newId()}@example.test`)
    await query(
      'INSERT INTO memberships (id, organization_id, user_id, role) VALUES ($1, $2, $3, $4)',
      [newId(), org.id, ownerId, 'owner'],
    )

    const clientId = newId()
    await query(
      'INSERT INTO clients (id, organization_id, name, slug, owner_user_id) VALUES ($1, $2, $3, $4, $5)',
      [clientId, org.id, 'Côte Ouest Distribution', 'cote-ouest', ownerId],
    )
    await query(
      `INSERT INTO client_contacts (id, organization_id, client_id, name, email)
       VALUES ($1, $2, $3, 'Awa', $4)`,
      [newId(), org.id, clientId, `awa-${newId()}@example.test`],
    )
  }, 180_000)

  afterAll(async () => {
    await admin?.end()
    await db?.stop()
  })

  it('returns the client with its owner and contact count', async () => {
    const rows = await withTenant({ organizationId: org.id }, (tx) =>
      tx.execute(
        sql.raw(`
          SELECT c.id, c.name, u.name AS owner_name,
                 (SELECT count(*)::int FROM client_contacts cc
                   WHERE cc.client_id = c.id AND cc.deleted_at IS NULL) AS contact_count
            FROM clients c
            LEFT JOIN industries i ON i.id = c.industry_id
            LEFT JOIN users u ON u.id = c.owner_user_id
           WHERE c.deleted_at IS NULL
        `),
      ),
    )

    expect(rows.rows).toHaveLength(1)
    const row = rows.rows[0] as { name: string; owner_name: string | null; contact_count: number }
    expect(row.name).toBe('Côte Ouest Distribution')
    expect(row.contact_count).toBe(1)
  })

  it('finds an accented name from an unaccented search', async () => {
    const found = await withTenant({ organizationId: org.id }, (tx) =>
      tx.execute(
        sql.raw(`SELECT id FROM clients WHERE unaccent(name) ILIKE unaccent('%cote ouest%')`),
      ),
    )
    expect(found.rows).toHaveLength(1)
  })
})
