import 'server-only'

import { sql } from 'drizzle-orm'
import type { TenantDb } from '@/db/tenant'
import { logger } from '@/lib/logger'
import type { SectionKey } from '../service'

/**
 * ============================================================================
 * ELEVEN SECTION PROVIDERS — one per section, independent of each other.
 *
 * R7, made concrete: **if a provider fails, its section is delivered EMPTY and
 * editable. The report is never blocked.**
 *
 * That is the whole point of the design. A report is written against a
 * deadline, by a person who cannot debug a SQL error. One section that cannot
 * count its deliverables must cost that section, not the afternoon.
 *
 * Each provider is a plain async function of `(db, scope)`. No shared state, no
 * ordering between them — so one can be fixed, tested or replaced without
 * reading the other ten.
 * ============================================================================
 */
export type ReportScope = {
  organizationId: string
  projectId: string | null
  clientId: string | null
  periodStart: string
  periodEnd: string
}

export type SectionData = Record<string, unknown>

export type SectionProvider = (db: TenantDb, scope: ReportScope) => Promise<SectionData>

/**
 * The scope, as a SQL clause.
 *
 * A report is about one project, one client across projects, or the whole
 * organisation. Written once here so eleven providers cannot each get it
 * subtly different.
 */
function projectScope(scope: ReportScope, column = 'project_id') {
  if (scope.projectId) return sql`AND ${sql.raw(column)} = ${scope.projectId}`
  if (scope.clientId) {
    return sql`AND ${sql.raw(column)} IN (
      SELECT p.id FROM projects p WHERE p.client_id = ${scope.clientId} AND p.deleted_at IS NULL
    )`
  }
  return sql``
}

const rowsOf = (result: { rows: unknown[] }) => result.rows as Record<string, unknown>[]

/**
 * The executive summary is COUNTED, not written.
 *
 * The provider supplies the figures a human then turns into two paragraphs —
 * it does not attempt the prose. Generating the sentence would be the
 * "IA de rédaction" the cahier des charges puts in V2 for a reason: the MVP
 * must prove the raw data is already enough.
 */
const executiveSummary: SectionProvider = async (db, scope) => {
  const result = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM actions a
        WHERE a.deleted_at IS NULL AND a.status = 'done'
          AND a.completed_at::date BETWEEN ${scope.periodStart} AND ${scope.periodEnd}
          ${projectScope(scope, 'a.project_id')}) AS actions_done,
      (SELECT count(*)::int FROM deliverables d
        WHERE d.deleted_at IS NULL AND d.status IN ('approved', 'published')
          AND d.updated_at::date BETWEEN ${scope.periodStart} AND ${scope.periodEnd}
          ${projectScope(scope, 'd.project_id')}) AS deliverables_delivered,
      (SELECT count(*)::int FROM results r
        WHERE r.deleted_at IS NULL
          AND r.recorded_for BETWEEN ${scope.periodStart} AND ${scope.periodEnd}
          ${projectScope(scope, 'r.project_id')}) AS results_recorded,
      (SELECT count(*)::int FROM insights i
        WHERE i.deleted_at IS NULL
          AND i.created_at::date BETWEEN ${scope.periodStart} AND ${scope.periodEnd}
          ${projectScope(scope, 'i.project_id')}) AS insights_written
  `)

  return (result.rows[0] ?? {}) as SectionData
}

const objectives: SectionProvider = async (db, scope) => {
  const result = await db.execute(sql`
    SELECT o.id, o.title, o.status, o.target_value, o.current_value, o.currency,
           o.achievement_percent, m.labels AS metric_labels
      FROM objectives o
      LEFT JOIN metrics m ON m.id = o.metric_id
     WHERE o.deleted_at IS NULL ${projectScope(scope, 'o.project_id')}
     ORDER BY o.title
     LIMIT 100
  `)
  return { objectives: rowsOf(result) }
}

const actions: SectionProvider = async (db, scope) => {
  const result = await db.execute(sql`
    SELECT a.status, count(*)::int AS count
      FROM actions a
     WHERE a.deleted_at IS NULL
       AND a.updated_at::date BETWEEN ${scope.periodStart} AND ${scope.periodEnd}
       ${projectScope(scope, 'a.project_id')}
     GROUP BY a.status
  `)

  const completed = await db.execute(sql`
    SELECT a.id, a.title, a.completed_at
      FROM actions a
     WHERE a.deleted_at IS NULL AND a.status = 'done'
       AND a.completed_at::date BETWEEN ${scope.periodStart} AND ${scope.periodEnd}
       ${projectScope(scope, 'a.project_id')}
     ORDER BY a.completed_at DESC
     LIMIT 50
  `)

  return { byStatus: rowsOf(result), completed: rowsOf(completed) }
}

const deliverables: SectionProvider = async (db, scope) => {
  const result = await db.execute(sql`
    SELECT d.id, d.title, d.status, d.due_date, d.approved_at, d.published_at
      FROM deliverables d
     WHERE d.deleted_at IS NULL
       AND d.updated_at::date BETWEEN ${scope.periodStart} AND ${scope.periodEnd}
       ${projectScope(scope, 'd.project_id')}
     ORDER BY d.updated_at DESC
     LIMIT 50
  `)
  return { deliverables: rowsOf(result) }
}

/**
 * The numbers, aggregated by metric — and `GROUP BY currency`, always.
 *
 * Two currencies are never summed into one figure (ADR-024), not even in a
 * report where it would look tidier.
 */
const results: SectionProvider = async (db, scope) => {
  const result = await db.execute(sql`
    SELECT m.code, m.labels, m.unit, m.decimals, rm.currency,
           CASE m.aggregation
             WHEN 'avg'  THEN avg(rm.value)
             WHEN 'max'  THEN max(rm.value)
             WHEN 'min'  THEN min(rm.value)
             WHEN 'last' THEN max(rm.value)
             ELSE sum(rm.value)
           END AS total,
           count(*)::int AS samples
      FROM result_metrics rm
      JOIN metrics m ON m.id = rm.metric_id
     WHERE rm.recorded_for BETWEEN ${scope.periodStart} AND ${scope.periodEnd}
       ${projectScope(scope, 'rm.project_id')}
     GROUP BY m.id, m.code, m.labels, m.unit, m.decimals, m.aggregation, rm.currency, m.sort_order
     ORDER BY m.sort_order
     LIMIT 100
  `)
  return { metrics: rowsOf(result) }
}

/** `Objectif → Réel → Écart`, the comparison the whole product is built to make. */
const objectivesComparison: SectionProvider = async (db, scope) => {
  const result = await db.execute(sql`
    SELECT o.id, o.title, o.target_value, o.current_value, o.currency,
           o.achievement_percent, o.status, m.direction, m.decimals, m.labels AS metric_labels
      FROM objectives o
      LEFT JOIN metrics m ON m.id = o.metric_id
     WHERE o.deleted_at IS NULL
       AND (o.period_end IS NULL OR o.period_end >= ${scope.periodStart})
       AND (o.period_start IS NULL OR o.period_start <= ${scope.periodEnd})
       ${projectScope(scope, 'o.project_id')}
     ORDER BY o.title
     LIMIT 100
  `)
  return { objectives: rowsOf(result) }
}

/** What the team wrote when recording results. Their words, not a summary of them. */
const analysis: SectionProvider = async (db, scope) => {
  const result = await db.execute(sql`
    SELECT r.id, r.title, r.recorded_for, r.analysis
      FROM results r
     WHERE r.deleted_at IS NULL AND r.analysis IS NOT NULL AND r.analysis <> ''
       AND r.recorded_for BETWEEN ${scope.periodStart} AND ${scope.periodEnd}
       ${projectScope(scope, 'r.project_id')}
     ORDER BY r.recorded_for DESC
     LIMIT 30
  `)
  return { analyses: rowsOf(result) }
}

/** `what_didnt` is absent: a report is not where an agency self-incriminates (ADR-065). */
const insights: SectionProvider = async (db, scope) => {
  const result = await db.execute(sql`
    SELECT i.id, i.title, i.what_worked, i.what_we_learned, i.recommendation
      FROM insights i
     WHERE i.deleted_at IS NULL
       AND i.created_at::date BETWEEN ${scope.periodStart} AND ${scope.periodEnd}
       ${projectScope(scope, 'i.project_id')}
     ORDER BY i.created_at DESC
     LIMIT 30
  `)
  return { insights: rowsOf(result) }
}

/**
 * What is going wrong. INTERNAL by default and by rule (`isInternalSection`).
 *
 * It is the report's equivalent of `what_didnt`: the agency chooses to have
 * that conversation, a default must not have it for them.
 */
const attentionPoints: SectionProvider = async (db, scope) => {
  const risks = await db.execute(sql`
    SELECT r.id, r.title, r.level, r.status, r.mitigation_plan
      FROM risks r
     WHERE r.deleted_at IS NULL AND r.status <> 'closed'
       ${projectScope(scope, 'r.project_id')}
     ORDER BY CASE r.level WHEN 'critical' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END
     LIMIT 30
  `)

  const overdue = await db.execute(sql`
    SELECT count(*)::int AS count
      FROM actions a
     WHERE a.deleted_at IS NULL AND a.status NOT IN ('done', 'cancelled')
       AND a.due_date < current_date
       ${projectScope(scope, 'a.project_id')}
  `)

  return { risks: rowsOf(risks), overdueActions: rowsOf(overdue)[0]?.count ?? 0 }
}

/** The recommendations already written on insights and results. */
const recommendations: SectionProvider = async (db, scope) => {
  const result = await db.execute(sql`
    SELECT i.id, i.title, i.recommendation, 'insight' AS source
      FROM insights i
     WHERE i.deleted_at IS NULL AND i.recommendation IS NOT NULL AND i.recommendation <> ''
       AND i.created_at::date BETWEEN ${scope.periodStart} AND ${scope.periodEnd}
       ${projectScope(scope, 'i.project_id')}
     UNION ALL
    SELECT r.id, r.title, r.recommendation, 'result' AS source
      FROM results r
     WHERE r.deleted_at IS NULL AND r.recommendation IS NOT NULL AND r.recommendation <> ''
       AND r.recorded_for BETWEEN ${scope.periodStart} AND ${scope.periodEnd}
       ${projectScope(scope, 'r.project_id')}
     LIMIT 30
  `)
  return { recommendations: rowsOf(result) }
}

/** What happens after the period — the loop's last step, in the report. */
const nextSteps: SectionProvider = async (db, scope) => {
  const result = await db.execute(sql`
    SELECT a.id, a.title, a.due_date, a.source_insight_id IS NOT NULL AS from_insight
      FROM actions a
     WHERE a.deleted_at IS NULL AND a.status NOT IN ('done', 'cancelled')
       AND (a.due_date IS NULL OR a.due_date > ${scope.periodEnd})
       ${projectScope(scope, 'a.project_id')}
     ORDER BY a.due_date ASC NULLS LAST
     LIMIT 30
  `)
  return { nextActions: rowsOf(result) }
}

export const PROVIDERS: Record<SectionKey, SectionProvider> = {
  executive_summary: executiveSummary,
  objectives,
  actions,
  deliverables,
  results,
  objectives_comparison: objectivesComparison,
  analysis,
  insights,
  attention_points: attentionPoints,
  recommendations,
  next_steps: nextSteps,
}

export type SectionOutcome = {
  key: SectionKey
  data: SectionData
  /** True when the provider threw. The section is delivered empty and editable (R7). */
  failed: boolean
}

/**
 * Runs the providers for a set of sections.
 *
 * Sequential, not Promise.all: one transaction runs one query at a time
 * (ADR-044) — and the failures are per-section by construction, so nothing is
 * lost by going in order.
 *
 * A provider that throws is LOGGED and its section comes back empty. It is the
 * only place in the product where an error is swallowed on purpose, and the
 * reason is written above: a report is written against a deadline (R7).
 */
export async function runProviders(
  db: TenantDb,
  scope: ReportScope,
  keys: readonly SectionKey[],
): Promise<SectionOutcome[]> {
  const outcomes: SectionOutcome[] = []

  for (const key of keys) {
    try {
      outcomes.push({ key, data: await PROVIDERS[key](db, scope), failed: false })
    } catch (error) {
      logger.error({ err: error, section: key, scope }, 'report section provider failed')
      outcomes.push({ key, data: {}, failed: true })
    }
  }

  return outcomes
}
