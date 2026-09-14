import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedSystemData } from '@/db/seed'
import { INDUSTRY_SEED } from '@/db/seed/industries'
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

  it('inserts every declared sector on a fresh database', async () => {
    const { inserted } = await seedSystemData(db.adminUrl)
    expect(inserted).toBe(INDUSTRY_SEED.length)

    const { rows } = await admin.query<{ count: string }>(
      'SELECT count(*) FROM industries WHERE organization_id IS NULL',
    )
    expect(Number(rows[0]?.count)).toBe(INDUSTRY_SEED.length)
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

  it('declares no duplicate code and gives every entry both languages', () => {
    const codes = INDUSTRY_SEED.map((entry) => entry.code)
    expect(new Set(codes).size).toBe(codes.length)

    for (const entry of INDUSTRY_SEED) {
      expect(entry.labels.fr.length, entry.code).toBeGreaterThan(0)
      expect(entry.labels.en.length, entry.code).toBeGreaterThan(0)
    }
  })
})
