import { Client, type QueryResultRow } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { refreshDerivedViews } from '@/db/refresh-views'
import { seedSystemData } from '@/db/seed'
import { newId, seedOrganization, startTestDatabase, type TestDatabase } from '../helpers/database'

/**
 * `result_metrics_daily`, against a real database.
 *
 * The view is an ANSWER, not a store: whatever it says must be re-derivable
 * from `result_metrics` alone. So the assertions here are about what the
 * aggregate is allowed to claim — and, above all, about what it must refuse to
 * claim: that two currencies add up (ADR-024).
 */
describe('the derived aggregates', () => {
  let db: TestDatabase
  let admin: Client
  let orgA: { id: string }
  let orgB: { id: string }
  let projectA: string
  let metricId: string

  const query = <R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) =>
    admin.query<R>(text, params)

  beforeAll(async () => {
    db = await startTestDatabase()
    admin = new Client({ connectionString: db.adminUrl })
    await admin.connect()
    await seedSystemData(db.adminUrl)

    orgA = await seedOrganization((text, params) => query(text, params), 'views-a')
    orgB = await seedOrganization((text, params) => query(text, params), 'views-b')

    const { rows } = await query<{ id: string }>(
      `SELECT id FROM metrics WHERE organization_id IS NULL AND code = 'revenue'`,
    )
    const found = rows[0]?.id
    if (!found) throw new Error('the revenue metric is missing from the system seed')
    metricId = found

    projectA = await seedProject(orgA.id, 'Campaign A')
  }, 180_000)

  afterAll(async () => {
    await admin?.end()
    await db?.stop()
  })

  async function seedProject(organizationId: string, name: string): Promise<string> {
    const id = newId()
    await query(
      `INSERT INTO projects (id, organization_id, name, code, timezone)
       VALUES ($1, $2, $3, $4, 'Africa/Abidjan')`,
      [id, organizationId, name, `P-${id.slice(0, 8)}`],
    )
    return id
  }

  async function seedMeasurement(input: {
    organizationId: string
    projectId: string
    value: string
    currency: string | null
    recordedFor: string
  }): Promise<void> {
    const resultId = newId()
    await query(
      `INSERT INTO results (id, organization_id, project_id, recorded_for)
       VALUES ($1, $2, $3, $4)`,
      [resultId, input.organizationId, input.projectId, input.recordedFor],
    )
    await query(
      `INSERT INTO result_metrics
         (id, organization_id, result_id, metric_id, field_key, value, currency,
          project_id, recorded_for)
       VALUES ($1, $2, $3, $4, 'revenue', $5, $6, $7, $8)`,
      [
        newId(),
        input.organizationId,
        resultId,
        metricId,
        input.value,
        input.currency,
        input.projectId,
        input.recordedFor,
      ],
    )
  }

  /**
   * An UNPOPULATED view cannot be refreshed concurrently, and an unpopulated
   * view is not hypothetical: `REFRESH ... WITH NO DATA` is how an operator
   * empties one, and it is the state a view restored from a schema-only dump
   * comes back in. Reading it does not return zero rows — it raises. So the
   * fallback is part of the contract, and this drives the view into that state
   * to prove the job recovers instead of dying.
   */
  it('recovers a view that holds no data', async () => {
    await seedMeasurement({
      organizationId: orgA.id,
      projectId: projectA,
      value: '1200.5000',
      currency: 'XOF',
      recordedFor: '2026-03-02',
    })

    await admin.query('REFRESH MATERIALIZED VIEW result_metrics_daily WITH NO DATA')

    // The raw statement refuses — which is the whole reason the job asks
    // pg_matviews first instead of trying and reading the failure.
    await expect(
      admin.query('REFRESH MATERIALIZED VIEW CONCURRENTLY result_metrics_daily'),
    ).rejects.toThrow(/not populated/i)

    await expect(refreshDerivedViews(db.adminUrl)).resolves.toEqual({ views: 1 })

    const { rows } = await query<{ total: string; samples: number }>(
      'SELECT total, samples FROM result_metrics_daily WHERE organization_id = $1',
      [orgA.id],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.total).toBe('1200.5000')
    expect(rows[0]?.samples).toBe(1)
  })

  /** Once populated, the refresh takes the concurrent path and stays readable. */
  it('refreshes concurrently once populated, and picks up new measurements', async () => {
    await seedMeasurement({
      organizationId: orgA.id,
      projectId: projectA,
      value: '299.5000',
      currency: 'XOF',
      recordedFor: '2026-03-02',
    })

    await refreshDerivedViews(db.adminUrl)

    const { rows } = await query<{ total: string; average: string; samples: number }>(
      `SELECT total, average, samples FROM result_metrics_daily
        WHERE organization_id = $1 AND recorded_for = '2026-03-02' AND currency = 'XOF'`,
      [orgA.id],
    )
    expect(rows).toHaveLength(1)
    // 1200.5 + 299.5 — the STRING is exact, because numeric(20,4) never became
    // a float on the way through. An average carries more decimals than a sum,
    // so it is the value that is asserted, not its spelling.
    expect(rows[0]?.total).toBe('1500.0000')
    expect(Number(rows[0]?.average)).toBe(750)
    expect(rows[0]?.samples).toBe(2)
  })

  /**
   * The guard that matters: a euro and a franc land in DIFFERENT rows. If the
   * GROUP BY ever loses `currency`, this test reads one row of nonsense
   * instead of two rows of truth.
   */
  it('never adds two currencies into one row (ADR-024)', async () => {
    await seedMeasurement({
      organizationId: orgA.id,
      projectId: projectA,
      value: '10.0000',
      currency: 'EUR',
      recordedFor: '2026-03-02',
    })

    await refreshDerivedViews(db.adminUrl)

    const { rows } = await query<{ currency: string; total: string }>(
      `SELECT currency, total FROM result_metrics_daily
        WHERE organization_id = $1 AND recorded_for = '2026-03-02'
        ORDER BY currency`,
      [orgA.id],
    )
    expect(rows.map((row) => [row.currency, row.total])).toEqual([
      ['EUR', '10.0000'],
      ['XOF', '1500.0000'],
    ])
  })

  /** A deleted result stops counting: the view reads the live truth. */
  it('drops the measurements of a soft-deleted result', async () => {
    const before = await totalFor(orgA.id, 'EUR')
    expect(before).toBe('10.0000')

    await query(
      `UPDATE results SET deleted_at = now()
        WHERE organization_id = $1
          AND id IN (SELECT result_id FROM result_metrics WHERE currency = 'EUR')`,
      [orgA.id],
    )
    await refreshDerivedViews(db.adminUrl)

    expect(await totalFor(orgA.id, 'EUR')).toBeUndefined()
  })

  /** One organisation's rows are never folded into another's. */
  it('keeps organisations in separate rows', async () => {
    const projectB = await seedProject(orgB.id, 'Campaign B')
    await seedMeasurement({
      organizationId: orgB.id,
      projectId: projectB,
      value: '7.0000',
      currency: 'XOF',
      recordedFor: '2026-03-02',
    })
    await refreshDerivedViews(db.adminUrl)

    expect(await totalFor(orgA.id, 'XOF')).toBe('1500.0000')
    expect(await totalFor(orgB.id, 'XOF')).toBe('7.0000')
  })

  /**
   * A materialised view cannot carry row level security, so it is never granted
   * to the application role. If a later migration grants it "to make a
   * dashboard work", this test is the alarm: the view would answer for every
   * tenant at once.
   */
  it('is not readable by the application role', async () => {
    const app = new Client({ connectionString: db.appUrl })
    await app.connect()
    try {
      await expect(app.query('SELECT * FROM result_metrics_daily')).rejects.toThrow(
        /permission denied/i,
      )
    } finally {
      await app.end()
    }
  })

  async function totalFor(organizationId: string, currency: string): Promise<string | undefined> {
    const { rows } = await query<{ total: string }>(
      `SELECT total FROM result_metrics_daily
        WHERE organization_id = $1 AND recorded_for = '2026-03-02' AND currency = $2`,
      [organizationId, currency],
    )
    return rows[0]?.total
  }
})
