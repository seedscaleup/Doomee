import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedSystemData } from '@/db/seed'
import {
  ACTION_CATEGORY_SEED,
  ACTION_TYPE_SEED,
  CHANNEL_SEED,
  type TaxonomySeed,
} from '@/db/seed/action-taxonomies'
import { INDUSTRY_SEED } from '@/db/seed/industries'

/** Every seeded taxonomy, checked by the same rules — a new one is one line. */
const TAXONOMIES: readonly { table: string; entries: readonly TaxonomySeed[] }[] = [
  { table: 'industries', entries: INDUSTRY_SEED },
  { table: 'action_types', entries: ACTION_TYPE_SEED },
  { table: 'action_categories', entries: ACTION_CATEGORY_SEED },
  { table: 'channels', entries: CHANNEL_SEED },
]

const TOTAL = TAXONOMIES.reduce((sum, taxonomy) => sum + taxonomy.entries.length, 0)

import { startTestDatabase, type TestDatabase } from '../helpers/database'

/**
 * The seed runs on every deploy, so being idempotent is not a nicety: a second
 * run that duplicated every sector would corrupt every client record that
 * referenced one.
 */
describe('system data seed', () => {
  let db: TestDatabase
  let admin: Client

  beforeAll(async () => {
    db = await startTestDatabase()
    admin = new Client({ connectionString: db.adminUrl })
    await admin.connect()
  }, 180_000)

  afterAll(async () => {
    await admin?.end()
    await db?.stop()
  })

  it('inserts every declared entry of every taxonomy on a fresh database', async () => {
    const { inserted } = await seedSystemData(db.adminUrl)
    expect(inserted).toBe(TOTAL)

    for (const { table, entries } of TAXONOMIES) {
      const { rows } = await admin.query<{ count: string }>(
        `SELECT count(*) FROM ${table} WHERE organization_id IS NULL`,
      )
      expect(Number(rows[0]?.count), table).toBe(entries.length)
    }
  })

  it('inserts nothing on a second run', async () => {
    const { inserted } = await seedSystemData(db.adminUrl)
    expect(inserted).toBe(0)

    const { rows } = await admin.query<{ count: string }>(
      'SELECT count(*) FROM industries WHERE organization_id IS NULL',
    )
    expect(Number(rows[0]?.count)).toBe(INDUSTRY_SEED.length)
  })

  it('carries a label fix to an existing installation', async () => {
    await admin.query(
      `UPDATE industries SET labels = '{"fr":"périmé","en":"stale"}'::jsonb
        WHERE organization_id IS NULL AND code = 'retail'`,
    )

    await seedSystemData(db.adminUrl)

    const { rows } = await admin.query<{ labels: { fr: string } }>(
      `SELECT labels FROM industries WHERE organization_id IS NULL AND code = 'retail'`,
    )
    expect(rows[0]?.labels.fr).toBe('Distribution et commerce')
  })

  it('never touches an organisation own entries', async () => {
    const { rows: orgRows } = await admin.query<{ id: string }>(
      `INSERT INTO organizations (id, name, slug)
       VALUES (gen_random_uuid(), 'Seed org', 'seed-org') RETURNING id`,
    )
    const organizationId = orgRows[0]?.id

    await admin.query(
      `INSERT INTO industries (id, organization_id, code, labels)
       VALUES (gen_random_uuid(), $1, 'retail', '{"fr":"Le mien","en":"Mine"}'::jsonb)`,
      [organizationId],
    )

    await seedSystemData(db.adminUrl)

    const { rows } = await admin.query<{ labels: { fr: string } }>(
      `SELECT labels FROM industries WHERE organization_id = $1 AND code = 'retail'`,
      [organizationId],
    )
    // Same code as a system entry, different owner: the seed must leave it be.
    expect(rows[0]?.labels.fr).toBe('Le mien')
  })

  it.each(TAXONOMIES.map((taxonomy) => taxonomy.table))(
    '%s declares no duplicate code and gives every entry both languages',
    (table) => {
      const entries = TAXONOMIES.find((taxonomy) => taxonomy.table === table)?.entries ?? []
      expect(entries.length).toBeGreaterThan(0)

      const codes = entries.map((entry) => entry.code)
      expect(new Set(codes).size).toBe(codes.length)

      for (const entry of entries) {
        expect(entry.labels.fr.length, entry.code).toBeGreaterThan(0)
        expect(entry.labels.en.length, entry.code).toBeGreaterThan(0)
      }
    },
  )
})
