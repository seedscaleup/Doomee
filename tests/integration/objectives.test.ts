import { sql } from 'drizzle-orm'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { withTenant } from '@/db/tenant'
import { computeGap, toNumber } from '@/modules/objectives/service'
import { newId, seedOrganization, startTestDatabase, type TestDatabase } from '../helpers/database'

/**
 * What the database stores, and what the gap service makes of it.
 *
 * The interesting part is not the round trip but the PRECISION: an objective is
 * "générer 5 000 000 FCFA", and a float would quietly turn that into something
 * else. numeric(20,4) and a string-typed read are what keep it exact (CLAUDE.md
 * §7 — jamais de float).
 */
describe('storing an objective', () => {
  let db: TestDatabase
  let admin: Client
  let org: { id: string }
  let projectId: string

  const query = (text: string, params?: unknown[]) => admin.query(text, params)

  beforeAll(async () => {
    db = await startTestDatabase()
    admin = new Client({ connectionString: db.adminUrl })
    await admin.connect()

    org = await seedOrganization(query, 'objectives')
    projectId = newId()
    await query('INSERT INTO projects (id, organization_id, name) VALUES ($1, $2, $3)', [
      projectId,
      org.id,
      'Projet',
    ])
  }, 180_000)

  afterAll(async () => {
    await admin?.end()
    await db?.stop()
  })

  it('keeps a large amount exactly, to four decimals', async () => {
    const id = newId()
    await query(
      `INSERT INTO objectives (id, organization_id, project_id, title, target_value, currency)
       VALUES ($1, $2, $3, 'CA', 5000000.1234, 'XOF')`,
      [id, org.id, projectId],
    )

    const { rows } = await query('SELECT target_value, currency FROM objectives WHERE id = $1', [
      id,
    ])
    const row = rows[0] as { target_value: string; currency: string }

    // A string, not a number: a JS number cannot hold every numeric(20,4).
    expect(typeof row.target_value).toBe('string')
    expect(row.target_value).toBe('5000000.1234')
    expect(row.currency).toBe('XOF')
    expect(toNumber(row.target_value)).toBe(5000000.1234)
  })

  it('starts with no result and no achievement', async () => {
    const id = newId()
    await query(
      `INSERT INTO objectives (id, organization_id, project_id, title, target_value)
       VALUES ($1, $2, $3, 'Impressions', 500000)`,
      [id, org.id, projectId],
    )

    const { rows } = await query(
      'SELECT current_value, achievement_percent, status, is_client_visible FROM objectives WHERE id = $1',
      [id],
    )
    const row = rows[0] as {
      current_value: string | null
      achievement_percent: number | null
      status: string
      is_client_visible: boolean
    }

    expect(row.current_value).toBeNull()
    expect(row.achievement_percent).toBeNull()
    expect(row.status).toBe('draft')
    // Unlike most flags this one defaults to true: an objective is what the
    // client is paying for.
    expect(row.is_client_visible).toBe(true)
  })

  it('reads back through app_user under row level security', async () => {
    const id = newId()
    await query(
      `INSERT INTO objectives (id, organization_id, project_id, title, target_value, currency)
       VALUES ($1, $2, $3, 'Lisible', 1000, 'EUR')`,
      [id, org.id, projectId],
    )

    const rows = await withTenant({ organizationId: org.id }, (tx) =>
      tx.execute(sql`SELECT title, target_value, currency FROM objectives WHERE id = ${id}`),
    )
    expect(rows.rows).toHaveLength(1)
  })

  it('refuses an objective pointing at another tenant’s project', async () => {
    const other = await seedOrganization(query, 'objectives-other')
    const foreignProject = newId()
    await query('INSERT INTO projects (id, organization_id, name) VALUES ($1, $2, $3)', [
      foreignProject,
      other.id,
      'Ailleurs',
    ])

    // The composite foreign key, not a review, is what makes this impossible.
    await expect(
      query(
        `INSERT INTO objectives (id, organization_id, project_id, title)
         VALUES ($1, $2, $3, 'Intruse')`,
        [newId(), org.id, foreignProject],
      ),
    ).rejects.toThrow(/objectives_org_project_fk|foreign key/i)
  })
})

/**
 * The metric catalogue is what makes an objective scoreable, so the gap service
 * is exercised against the REAL seeded rows rather than against invented ones:
 * a direction that is wrong in the seed is wrong in every report.
 */
describe('scoring against the seeded metrics', () => {
  let db: TestDatabase
  let admin: Client

  beforeAll(async () => {
    db = await startTestDatabase()
    admin = new Client({ connectionString: db.adminUrl })
    await admin.connect()

    const { seedSystemData } = await import('@/db/seed')
    await seedSystemData(db.adminUrl)
  }, 180_000)

  afterAll(async () => {
    await admin?.end()
    await db?.stop()
  })

  it('scores revenue and cost per lead in opposite directions', async () => {
    const { rows } = await admin.query<{ code: string; direction: string }>(
      `SELECT code, direction FROM metrics WHERE organization_id IS NULL AND code IN ('revenue', 'cpl')`,
    )
    const byCode = new Map(rows.map((row) => [row.code, row.direction]))

    const overshoot = { targetValue: 100, currentValue: 130 }

    const revenue = computeGap({
      ...overshoot,
      direction: byCode.get('revenue') as 'higher_is_better',
    })
    const cpl = computeGap({ ...overshoot, direction: byCode.get('cpl') as 'lower_is_better' })

    expect(revenue).toMatchObject({ verdict: 'ahead' })
    expect(cpl).toMatchObject({ verdict: 'behind' })
  })
})
