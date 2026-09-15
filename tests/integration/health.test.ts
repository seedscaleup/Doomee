import { sql } from 'drizzle-orm'
import { Client, type QueryResultRow } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedSystemData } from '@/db/seed'
import { withTenant } from '@/db/tenant'
import { newId, seedOrganization, startTestDatabase, type TestDatabase } from '../helpers/database'

/**
 * ============================================================================
 * THE HEALTH SCORE, against a real database.
 *
 * The pure service proves the ARITHMETIC is right. What matters here is that
 * the measurement query counts what the service thinks it counts — the two
 * halves meet in exactly one place, and this is it.
 * ============================================================================
 */
describe('measuring a project’s health', () => {
  let db: TestDatabase
  let admin: Client
  let org: { id: string }
  let projectId: string

  const query = <R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) =>
    admin.query<R>(text, params)

  beforeAll(async () => {
    db = await startTestDatabase()
    admin = new Client({ connectionString: db.adminUrl })
    await admin.connect()
    await seedSystemData(db.adminUrl)

    org = await seedOrganization((t, p) => query(t, p), 'health')
    projectId = newId()
    await query(
      `INSERT INTO projects (id, organization_id, name, code, timezone,
                             start_date, end_date, progress_percent)
       VALUES ($1, $2, 'Refonte', $3, 'Africa/Abidjan',
               current_date - 60, current_date + 40, 20)`,
      [projectId, org.id, `P-${projectId}`],
    )
  }, 240_000)

  afterAll(async () => {
    await admin?.end()
    await db?.stop()
  })

  const measure = async () => {
    const { measureProject } = await import('@/modules/health/queries')
    return withTenant({ organizationId: org.id }, (tx) => measureProject(tx, projectId))
  }

  it('reads the calendar as a percentage elapsed', async () => {
    const measured = await measure()
    // 60 days of a 100-day project.
    expect(measured.scheduleElapsedPercent).toBe(60)
    expect(measured.progressPercent).toBe(20)
  })

  /** A project with no dates cannot be late against a schedule it does not have. */
  it('reports no schedule for a project without dates', async () => {
    const undated = newId()
    await query(
      `INSERT INTO projects (id, organization_id, name, code, timezone)
       VALUES ($1, $2, 'Sans dates', $3, 'UTC')`,
      [undated, org.id, `P-${undated}`],
    )

    const { measureProject } = await import('@/modules/health/queries')
    const measured = await withTenant({ organizationId: org.id }, (tx) =>
      measureProject(tx, undated),
    )
    expect(measured.scheduleElapsedPercent).toBeNull()
  })

  it('counts overdue, blocked and unmeasured work', async () => {
    const late = newId()
    const blocked = newId()
    const doneNoResult = newId()

    await query(
      `INSERT INTO actions (id, organization_id, project_id, title, status, due_date)
       VALUES ($1, $4, $5, 'En retard', 'todo', current_date - 3),
              ($2, $4, $5, 'Bloquée', 'blocked', NULL),
              ($3, $4, $5, 'Finie sans résultat', 'done', NULL)`,
      [late, blocked, doneNoResult, org.id, projectId],
    )

    const measured = await measure()
    expect(measured.actionsTotal).toBe(3)
    expect(measured.actionsOverdue).toBe(1)
    expect(measured.actionsBlocked).toBe(1)
    // The factor that makes this a Doomee score: work shipped, nothing measured.
    expect(measured.doneActionsWithoutResult).toBe(1)
  })

  it('stops counting a finished action once its result exists', async () => {
    const { rows } = await query<{ id: string }>(
      `SELECT id FROM actions WHERE project_id = $1 AND status = 'done'`,
      [projectId],
    )
    const actionId = rows[0]?.id

    await query(
      `INSERT INTO results (id, organization_id, project_id, action_id, recorded_for)
       VALUES ($1, $2, $3, $4, current_date)`,
      [newId(), org.id, projectId, actionId],
    )

    expect((await measure()).doneActionsWithoutResult).toBe(0)
  })

  /** Days waiting, not deliverables: the thing a manager actually notices. */
  it('measures a pending validation by how long it has waited', async () => {
    await query(
      `INSERT INTO deliverables
         (id, organization_id, project_id, title, status, is_client_visible, sent_to_client_at)
       VALUES ($1, $2, $3, 'Charte', 'client_review', true, now() - interval '5 days')`,
      [newId(), org.id, projectId],
    )

    const measured = await measure()
    expect(measured.deliverablesPendingClient).toBe(1)
    expect(measured.oldestPendingClientDays).toBe(5)
  })

  it('counts open risks and singles out the critical ones', async () => {
    await query(
      `INSERT INTO risks (id, organization_id, project_id, title, level, status)
       VALUES ($1, $4, $5, 'Retard fournisseur', 'medium', 'open'),
              ($2, $4, $5, 'Budget dépassé', 'critical', 'open'),
              ($3, $4, $5, 'Réglé', 'critical', 'closed')`,
      [newId(), newId(), newId(), org.id, projectId],
    )

    const measured = await measure()
    expect(measured.openRisks).toBe(2)
    expect(measured.criticalRisks).toBe(1)
  })

  /** A bus factor of one is a risk the project does not know it has. */
  it('finds the busiest single assignee, not the total', async () => {
    const alice = newId()
    const bob = newId()
    await query('INSERT INTO users (id, email, name) VALUES ($1, $2, $3), ($4, $5, $6)', [
      alice,
      `alice-${alice}@example.test`,
      'Alice',
      bob,
      `bob-${bob}@example.test`,
      'Bob',
    ])

    for (let i = 0; i < 4; i += 1) {
      await query(
        `INSERT INTO actions (id, organization_id, project_id, title, status, assignee_id)
         VALUES ($1, $2, $3, $4, 'todo', $5)`,
        [newId(), org.id, projectId, `Alice ${i}`, alice],
      )
    }
    await query(
      `INSERT INTO actions (id, organization_id, project_id, title, status, assignee_id)
       VALUES ($1, $2, $3, 'Bob 1', 'todo', $4)`,
      [newId(), org.id, projectId, bob],
    )

    const measured = await measure()
    expect(measured.busiestAssigneeOpenActions).toBe(4)
  })

  /**
   * ==========================================================================
   * The counter and the score move with the thing that caused them, in the
   * SAME transaction (ADR-013). "The dashboard was right yesterday" is not a
   * defence anyone accepts.
   * ==========================================================================
   */
  it('writes the score, the status and the history together', async () => {
    const { refreshProjectHealth } = await import('@/modules/health/mutations')

    const reading = await withTenant({ organizationId: org.id }, (tx) =>
      refreshProjectHealth(tx, org.id, projectId),
    )

    const stored = await query<{
      health_score: number
      health_status: string
      open_risks_count: number
    }>('SELECT health_score, health_status, open_risks_count FROM projects WHERE id = $1', [
      projectId,
    ])
    expect(stored.rows[0]?.health_score).toBe(reading.score)
    expect(stored.rows[0]?.health_status).toBe(reading.status)
    expect(stored.rows[0]?.open_risks_count).toBe(2)

    const history = await query<{ score: number }>(
      'SELECT score FROM project_health_snapshots WHERE project_id = $1',
      [projectId],
    )
    expect(history.rows.map((row) => row.score)).toContain(reading.score)
  })

  /** A blocked action makes a project blocked, whatever the average says. */
  it('calls a project with a blocked action blocked', async () => {
    const { refreshProjectHealth } = await import('@/modules/health/mutations')
    const reading = await withTenant({ organizationId: org.id }, (tx) =>
      refreshProjectHealth(tx, org.id, projectId),
    )
    expect(reading.status).toBe('blocked')
  })

  /** A snapshot is what the score WAS. It is never rewritten. */
  it('refuses to rewrite a snapshot', async () => {
    const { rows } = await query<{ id: string }>('SELECT id FROM project_health_snapshots LIMIT 1')
    const id = rows[0]?.id

    const message = await withTenant({ organizationId: org.id }, (tx) =>
      tx
        .execute(sql`UPDATE project_health_snapshots SET score = 100 WHERE id = ${id}`)
        .then(() => 'no error')
        .catch((error: unknown) => {
          const cause = (error as { cause?: { message?: string } }).cause
          return cause?.message ?? (error as Error).message
        }),
    )

    expect(message).toMatch(/permission denied for table project_health_snapshots/i)
  })

  /**
   * The weights come from the organisation's own settings (rule 7). A team
   * that does not care about workload can say so, and the score must follow.
   */
  it('reads the weights from the organisation, not from a constant', async () => {
    const { readWeights } = await import('@/modules/health/queries')

    /**
     * Assigned wholesale, not with `jsonb_set`: jsonb_set does NOT create a
     * missing PARENT path. On a `settings` of `{}`, `jsonb_set(…, '{health,
     * weights}', …, true)` returns the original untouched and reports success
     * — which is how this test first passed against the defaults while
     * proving nothing.
     */
    await query(
      `UPDATE organizations
          SET settings = coalesce(settings, '{}'::jsonb)
                       || '{"health": {"weights": {"overdue_actions": 1}}}'::jsonb
        WHERE id = $1`,
      [org.id],
    )

    const weights = await withTenant({ organizationId: org.id }, (tx) => readWeights(tx))
    expect(weights.overdue_actions).toBeCloseTo(1, 10)
    expect(weights.workload).toBe(0)
  })
})
