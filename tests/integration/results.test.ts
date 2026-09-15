import { sql } from 'drizzle-orm'
import { Client, type QueryResultRow } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedSystemData } from '@/db/seed'
import { withTenant } from '@/db/tenant'
import { newId, seedOrganization, startTestDatabase, type TestDatabase } from '../helpers/database'

/**
 * The quantitative half, against a real database.
 *
 * What matters here is not that rows go in, but that the NUMBERS survive: a
 * result is evidence, and evidence that rounds is not evidence (CLAUDE.md §7 —
 * jamais de float).
 */
describe('storing measurements', () => {
  let db: TestDatabase
  let admin: Client
  let org: { id: string }
  let projectId: string
  let metricId: string

  const query = <R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) =>
    admin.query<R>(text, params)

  beforeAll(async () => {
    db = await startTestDatabase()
    admin = new Client({ connectionString: db.adminUrl })
    await admin.connect()
    await seedSystemData(db.adminUrl)

    org = await seedOrganization(query, 'results')
    projectId = newId()
    await query('INSERT INTO projects (id, organization_id, name) VALUES ($1, $2, $3)', [
      projectId,
      org.id,
      'Projet',
    ])

    const { rows } = await query<{ id: string }>(
      `SELECT id FROM metrics WHERE organization_id IS NULL AND code = 'revenue'`,
    )
    metricId = rows[0]?.id as string
  }, 180_000)

  afterAll(async () => {
    await admin?.end()
    await db?.stop()
  })

  async function seedResult(recordedFor: string, value: string): Promise<string> {
    const resultId = newId()
    await query(
      `INSERT INTO results (id, organization_id, project_id, recorded_for)
       VALUES ($1, $2, $3, $4)`,
      [resultId, org.id, projectId, recordedFor],
    )
    await query(
      `INSERT INTO result_metrics
         (id, organization_id, result_id, metric_id, field_key, value, currency, project_id, recorded_for)
       VALUES ($1, $2, $3, $4, 'revenue', $5, 'XOF', $6, $7)`,
      [newId(), org.id, resultId, metricId, value, projectId, recordedFor],
    )
    return resultId
  }

  it('keeps a large amount exactly, to four decimals', async () => {
    await seedResult('2026-03-01', '5000000.1234')

    const { rows } = await query<{ value: string; currency: string }>(
      `SELECT value, currency FROM result_metrics WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [projectId],
    )
    // A string, not a number: numeric(20,4) holds what a JS number cannot.
    expect(typeof rows[0]?.value).toBe('string')
    expect(rows[0]?.value).toBe('5000000.1234')
    expect(rows[0]?.currency).toBe('XOF')
  })

  it('refuses a measurement whose result belongs to another tenant', async () => {
    const other = await seedOrganization(query, 'results-other')
    const foreignResult = newId()
    const foreignProject = newId()
    await query('INSERT INTO projects (id, organization_id, name) VALUES ($1, $2, $3)', [
      foreignProject,
      other.id,
      'Ailleurs',
    ])
    await query(
      `INSERT INTO results (id, organization_id, project_id, recorded_for)
       VALUES ($1, $2, $3, current_date)`,
      [foreignResult, other.id, foreignProject],
    )

    await expect(
      query(
        `INSERT INTO result_metrics
           (id, organization_id, result_id, metric_id, field_key, value, recorded_for)
         VALUES ($1, $2, $3, $4, 'revenue', 1, current_date)`,
        [newId(), org.id, foreignResult, metricId],
      ),
    ).rejects.toThrow(/result_metrics_org_result_fk|foreign key/i)
  })

  it('never lets a measurement be silently rewritten', async () => {
    const resultId = await seedResult('2026-03-02', '100')

    // app_user may delete a measurement (a withdrawn result must stop being
    // counted) but never edit one: correcting means recording the correction.
    const error = await withTenant({ organizationId: org.id }, (tx) =>
      tx.execute(sql`UPDATE result_metrics SET value = 999 WHERE result_id = ${resultId}`),
    ).catch((caught: unknown) => caught)

    expect(String((error as { cause?: { message?: string } })?.cause?.message ?? error)).toMatch(
      /permission denied/i,
    )
  })

  it('refuses two measurements of the same field on one result', async () => {
    const resultId = await seedResult('2026-03-03', '10')

    await expect(
      query(
        `INSERT INTO result_metrics
           (id, organization_id, result_id, metric_id, field_key, value, recorded_for)
         VALUES ($1, $2, $3, $4, 'revenue', 20, current_date)`,
        [newId(), org.id, resultId, metricId],
      ),
    ).rejects.toThrow(/result_metrics_result_field_key|duplicate key/i)
  })
})

/**
 * ============================================================================
 * THE COLUMN THAT CLOSES THE LOOP.
 *
 * `objectives.current_value` is rewritten by the transaction that records a
 * result (ADR-013). This checks the arithmetic against a real aggregate — and,
 * more importantly, that a rolled-back result leaves the objective untouched.
 * ============================================================================
 */
describe('an objective following its results', () => {
  let db: TestDatabase
  let admin: Client
  let org: { id: string }
  let projectId: string
  let objectiveId: string
  let impressionsId: string

  const query = <R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) =>
    admin.query<R>(text, params)

  beforeAll(async () => {
    db = await startTestDatabase()
    admin = new Client({ connectionString: db.adminUrl })
    await admin.connect()
    await seedSystemData(db.adminUrl)

    org = await seedOrganization(query, 'objective-follow')
    projectId = newId()
    await query('INSERT INTO projects (id, organization_id, name) VALUES ($1, $2, $3)', [
      projectId,
      org.id,
      'Projet',
    ])

    const { rows } = await query<{ id: string }>(
      `SELECT id FROM metrics WHERE organization_id IS NULL AND code = 'impressions'`,
    )
    impressionsId = rows[0]?.id as string

    objectiveId = newId()
    await query(
      `INSERT INTO objectives (id, organization_id, project_id, title, metric_id, target_value, status)
       VALUES ($1, $2, $3, 'Mille impressions', $4, 1000, 'active')`,
      [objectiveId, org.id, projectId, impressionsId],
    )
  }, 180_000)

  afterAll(async () => {
    await admin?.end()
    await db?.stop()
  })

  it('sums the measurements of its metric across results', async () => {
    for (const value of ['400', '350']) {
      const resultId = newId()
      await query(
        `INSERT INTO results (id, organization_id, project_id, recorded_for)
         VALUES ($1, $2, $3, current_date)`,
        [resultId, org.id, projectId],
      )
      await query(
        `INSERT INTO result_metrics
           (id, organization_id, result_id, metric_id, field_key, value, project_id, recorded_for)
         VALUES ($1, $2, $3, $4, 'impressions', $5, $6, current_date)`,
        [newId(), org.id, resultId, impressionsId, value, projectId],
      )
    }

    const { rows } = await query<{ total: string }>(
      `SELECT sum(value) AS total FROM result_metrics
        WHERE project_id = $1 AND metric_id = $2`,
      [projectId, impressionsId],
    )
    expect(Number(rows[0]?.total)).toBe(750)
  })

  it('leaves the objective untouched when the result rolls back', async () => {
    await query(
      'UPDATE objectives SET current_value = 750, achievement_percent = 75 WHERE id = $1',
      [objectiveId],
    )

    await expect(
      withTenant({ organizationId: org.id }, async (tx) => {
        const resultId = newId()
        await tx.execute(sql`
          INSERT INTO results (id, organization_id, project_id, recorded_for)
          VALUES (${resultId}, ${org.id}, ${projectId}, current_date)
        `)
        await tx.execute(sql`
          UPDATE objectives SET current_value = 9999, achievement_percent = 999
           WHERE id = ${objectiveId}
        `)

        // The result and the counter it moves are one fact written twice.
        throw new Error('rolled back on purpose')
      }),
    ).rejects.toThrow('rolled back on purpose')

    const { rows } = await query<{ current_value: string; achievement_percent: number }>(
      'SELECT current_value, achievement_percent FROM objectives WHERE id = $1',
      [objectiveId],
    )
    expect(Number(rows[0]?.current_value)).toBe(750)
    expect(rows[0]?.achievement_percent).toBe(75)
  })
})
