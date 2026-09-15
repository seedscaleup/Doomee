import 'server-only'

import { and, asc, desc, eq, isNull, type SQL, sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  actions,
  actionTypes,
  channels,
  clients,
  memberships,
  metrics,
  projects,
  resultFormFields,
  resultFormTemplates,
  resultMetrics,
  resultNotes,
  results,
  users,
} from '@/db/schema'
import type { TenantDb } from '@/db/tenant'
import { type Actor, can } from '@/lib/permissions'
import { defineQuery } from '@/server'
import { listResultsSchema } from './schemas'
import type {
  FilterOptions,
  FormTemplate,
  MetricTotal,
  PerformanceRow,
  ResultMetricRow,
  ResultNoteRow,
  ResultRow,
} from './types'

/** The project scope, one level down (ADR-038). */
function withinVisibleProjects(actor: Actor): SQL | undefined {
  if (can(actor, 'project.read_all')) return undefined

  return sql`EXISTS (
    SELECT 1 FROM project_members pm
     WHERE pm.project_id = ${results.projectId}
       AND pm.user_id = ${actor.userId}
  )`
}

/**
 * The form for an action — the whole point of ADR-008.
 *
 * Chosen by the action's TYPE, falling back to the generic template when that
 * type has no form of its own. An organisation's own template wins over the
 * system one for the same type, which is how a team adapts a form without a
 * deployment.
 */
export const getFormForAction = defineQuery({
  input: z.object({ actionId: z.uuid() }),
  permission: 'result.create',
  handler: async (input, { db }): Promise<FormTemplate | null> => {
    const [action] = await db
      .select({ actionTypeId: actions.actionTypeId })
      .from(actions)
      .where(and(eq(actions.id, input.actionId), isNull(actions.deletedAt)))
      .limit(1)

    if (!action) return null
    return loadTemplate(db, action.actionTypeId)
  },
})

/** The form for a result recorded on a project directly — the generic one. */
export const getGenericForm = defineQuery({
  permission: 'result.create',
  handler: async (_input: undefined, { db }): Promise<FormTemplate | null> =>
    loadTemplate(db, null),
})

async function loadTemplate(
  db: TenantDb,
  actionTypeId: string | null,
): Promise<FormTemplate | null> {
  const candidates = await db
    .select({
      id: resultFormTemplates.id,
      code: resultFormTemplates.code,
      labels: resultFormTemplates.labels,
      version: resultFormTemplates.version,
      actionTypeId: resultFormTemplates.actionTypeId,
      organizationId: resultFormTemplates.organizationId,
    })
    .from(resultFormTemplates)
    .where(eq(resultFormTemplates.isActive, true))
    .orderBy(desc(resultFormTemplates.version))

  // An organisation's own template wins; then one for this action type; then
  // the generic fallback, so "record a result" is never unavailable.
  const forType = candidates.filter((row) => row.actionTypeId === actionTypeId)
  const fallback = candidates.filter((row) => row.actionTypeId === null)
  const chosen =
    forType.find((row) => row.organizationId !== null) ??
    forType[0] ??
    fallback.find((row) => row.organizationId !== null) ??
    fallback[0]

  if (!chosen) return null

  const fields = await db
    .select({
      key: resultFormFields.key,
      kind: resultFormFields.kind,
      labels: resultFormFields.labels,
      help: resultFormFields.help,
      metricId: resultFormFields.metricId,
      metricCode: metrics.code,
      unit: resultFormFields.unit,
      isRequired: resultFormFields.isRequired,
      sortOrder: resultFormFields.sortOrder,
      options: resultFormFields.options,
      defaultValue: resultFormFields.defaultValue,
      min: resultFormFields.min,
      max: resultFormFields.max,
    })
    .from(resultFormFields)
    .leftJoin(metrics, eq(metrics.id, resultFormFields.metricId))
    .where(eq(resultFormFields.templateId, chosen.id))
    .orderBy(asc(resultFormFields.sortOrder))

  return {
    id: chosen.id,
    code: chosen.code,
    labels: chosen.labels,
    version: chosen.version,
    fields,
  }
}

export const listResults = defineQuery({
  input: listResultsSchema,
  permission: 'result.read',
  handler: async (input, { actor, db }): Promise<ResultRow[]> => {
    const filters: (SQL | undefined)[] = [isNull(results.deletedAt), withinVisibleProjects(actor)]

    if (input.projectId) filters.push(eq(results.projectId, input.projectId))
    if (input.actionId) filters.push(eq(results.actionId, input.actionId))
    if (input.clientId) filters.push(eq(projects.clientId, input.clientId))
    if (input.recordedById) filters.push(eq(results.recordedBy, input.recordedById))
    if (input.from) filters.push(sql`${results.recordedFor} >= ${input.from}`)
    if (input.to) filters.push(sql`${results.recordedFor} <= ${input.to}`)

    return db
      .select({
        id: results.id,
        title: results.title,
        recordedFor: results.recordedFor,
        projectId: results.projectId,
        projectName: projects.name,
        clientName: clients.name,
        actionId: results.actionId,
        actionTitle: actions.title,
        analysis: results.analysis,
        recommendation: results.recommendation,
        isClientVisible: results.isClientVisible,
        recordedByName: users.name,
        metricCount: sql<number>`(
          SELECT count(*)::int FROM result_metrics rm WHERE rm.result_id = ${results.id}
        )`,
      })
      .from(results)
      .innerJoin(projects, eq(projects.id, results.projectId))
      .leftJoin(clients, eq(clients.id, projects.clientId))
      .leftJoin(actions, eq(actions.id, results.actionId))
      .leftJoin(users, eq(users.id, results.recordedBy))
      .where(and(...filters))
      .orderBy(desc(results.recordedFor), desc(results.createdAt))
      .limit(input.limit)
  },
})

export const getResult = defineQuery({
  input: z.object({ id: z.uuid() }),
  permission: 'result.read',
  handler: async (input, { actor, db }) => {
    const rows = await db
      .select({
        id: results.id,
        title: results.title,
        recordedFor: results.recordedFor,
        projectId: results.projectId,
        projectName: projects.name,
        clientName: clients.name,
        actionId: results.actionId,
        actionTitle: actions.title,
        analysis: results.analysis,
        recommendation: results.recommendation,
        isClientVisible: results.isClientVisible,
        recordedByName: users.name,
        metricCount: sql<number>`(
          SELECT count(*)::int FROM result_metrics rm WHERE rm.result_id = ${results.id}
        )`,
      })
      .from(results)
      .innerJoin(projects, eq(projects.id, results.projectId))
      .leftJoin(clients, eq(clients.id, projects.clientId))
      .leftJoin(actions, eq(actions.id, results.actionId))
      .leftJoin(users, eq(users.id, results.recordedBy))
      .where(and(eq(results.id, input.id), isNull(results.deletedAt), withinVisibleProjects(actor)))
      .limit(1)

    return rows[0] ?? null
  },
})

export const listResultMetrics = defineQuery({
  input: z.object({ resultId: z.uuid() }),
  permission: 'result.read',
  handler: async (input, { db }): Promise<ResultMetricRow[]> => {
    return db
      .select({
        metricId: resultMetrics.metricId,
        metricCode: metrics.code,
        metricLabels: metrics.labels,
        fieldKey: resultMetrics.fieldKey,
        value: resultMetrics.value,
        unit: resultMetrics.unit,
        currency: resultMetrics.currency,
        decimals: metrics.decimals,
      })
      .from(resultMetrics)
      .innerJoin(metrics, eq(metrics.id, resultMetrics.metricId))
      .where(eq(resultMetrics.resultId, input.resultId))
      .orderBy(asc(metrics.sortOrder))
  },
})

export const listResultNotes = defineQuery({
  input: z.object({ resultId: z.uuid() }),
  permission: 'result.read',
  handler: async (input, { db }): Promise<ResultNoteRow[]> => {
    return db
      .select({ id: resultNotes.id, kind: resultNotes.kind, body: resultNotes.body })
      .from(resultNotes)
      .where(eq(resultNotes.resultId, input.resultId))
      .orderBy(asc(resultNotes.sortOrder))
  },
})

/**
 * ============================================================================
 * THE CONSOLIDATED VIEW — every metric over a window, next to the same window
 * before it.
 *
 * Each metric is aggregated with ITS OWN aggregation (ADR-047): summing a CTR
 * would be arithmetic nonsense, so the SQL branches on the column rather than
 * defaulting to SUM.
 * ============================================================================
 */
export const metricTotals = defineQuery({
  input: listResultsSchema,
  permission: 'result.read',
  handler: async (input, { actor, db }): Promise<MetricTotal[]> => {
    const to = input.to ?? new Date().toISOString().slice(0, 10)
    const from = input.from ?? shiftDays(to, -30)
    const span = Math.max(1, daysBetween(from, to) + 1)
    const previousTo = shiftDays(from, -1)
    const previousFrom = shiftDays(previousTo, -(span - 1))

    const scope = can(actor, 'project.read_all')
      ? sql`TRUE`
      : sql`EXISTS (
          SELECT 1 FROM project_members pm
           WHERE pm.project_id = rm.project_id AND pm.user_id = ${actor.userId}
        )`

    const dimension = (column: string, value: string | undefined) =>
      value ? sql`AND rm.${sql.raw(column)} = ${value}` : sql``

    /**
     * `aggregate` picks the function from the metric's own column. A CASE in
     * SQL rather than six queries, and a metric whose aggregation is unknown
     * falls back to SUM — which is the right default for a count.
     */
    const rows = await db.execute(sql`
      WITH windowed AS (
        SELECT rm.metric_id,
               rm.value,
               (rm.recorded_for BETWEEN ${from} AND ${to}) AS current_window,
               (rm.recorded_for BETWEEN ${previousFrom} AND ${previousTo}) AS previous_window
          FROM result_metrics rm
         WHERE ${scope}
           AND rm.recorded_for BETWEEN ${previousFrom} AND ${to}
           ${dimension('project_id', input.projectId)}
           ${dimension('client_id', input.clientId)}
           ${dimension('channel_id', input.channelId)}
           ${dimension('action_type_id', input.actionTypeId)}
           ${
             /* Who recorded it lives on `results`, not on the denormalised
                measurement: the dimensions answer "about what", not "by whom". */
             input.recordedById
               ? sql`AND EXISTS (
                       SELECT 1 FROM results r
                        WHERE r.id = rm.result_id AND r.recorded_by = ${input.recordedById}
                     )`
               : sql``
}
      )
      SELECT m.id                AS metric_id,
             m.code              AS code,
             m.labels            AS labels,
             m.kind              AS kind,
             m.direction         AS direction,
             m.decimals          AS decimals,
             m.unit              AS unit,
             CASE m.aggregation
               WHEN 'avg'  THEN avg(w.value)  FILTER (WHERE w.current_window)
               WHEN 'max'  THEN max(w.value)  FILTER (WHERE w.current_window)
               WHEN 'min'  THEN min(w.value)  FILTER (WHERE w.current_window)
               WHEN 'last' THEN max(w.value)  FILTER (WHERE w.current_window)
               ELSE sum(w.value) FILTER (WHERE w.current_window)
             END AS total,
             CASE m.aggregation
               WHEN 'avg'  THEN avg(w.value)  FILTER (WHERE w.previous_window)
               WHEN 'max'  THEN max(w.value)  FILTER (WHERE w.previous_window)
               WHEN 'min'  THEN min(w.value)  FILTER (WHERE w.previous_window)
               WHEN 'last' THEN max(w.value)  FILTER (WHERE w.previous_window)
               ELSE sum(w.value) FILTER (WHERE w.previous_window)
             END AS previous,
             count(*) FILTER (WHERE w.current_window)::int AS samples
        FROM windowed w
        JOIN metrics m ON m.id = w.metric_id
       GROUP BY m.id, m.code, m.labels, m.kind, m.direction, m.decimals, m.unit, m.sort_order
      HAVING count(*) FILTER (WHERE w.current_window) > 0
       ORDER BY m.sort_order
    `)

    return (rows.rows as Record<string, unknown>[]).map((row) => ({
      metricId: String(row.metric_id),
      code: String(row.code),
      labels: row.labels as Record<string, string>,
      kind: String(row.kind),
      direction: String(row.direction),
      decimals: Number(row.decimals),
      unit: row.unit === null ? null : String(row.unit),
      total: Number(row.total),
      previous: row.previous === null ? null : Number(row.previous),
      samples: Number(row.samples),
    }))
  },
})

/**
 * ============================================================================
 * WHO DID BEST, AND WHO DID WORST — one metric, broken down by project.
 *
 * The aggregate answers "how much"; this answers "where". A total that moved
 * without saying which project moved it is a number nobody can act on, and
 * "what should we do next?" is the step of the loop this feeds.
 * ============================================================================
 */
export const metricBreakdown = defineQuery({
  input: listResultsSchema.extend({ metricId: z.uuid() }),
  permission: 'result.read',
  handler: async (input, { actor, db }): Promise<PerformanceRow[]> => {
    const to = input.to ?? new Date().toISOString().slice(0, 10)
    const from = input.from ?? shiftDays(to, -30)

    const scope = can(actor, 'project.read_all')
      ? sql`TRUE`
      : sql`EXISTS (
          SELECT 1 FROM project_members pm
           WHERE pm.project_id = rm.project_id AND pm.user_id = ${actor.userId}
        )`

    const rows = await db.execute(sql`
      SELECT p.id                      AS project_id,
             p.name                    AS project_name,
             c.name                    AS client_name,
             CASE m.aggregation
               WHEN 'avg'  THEN avg(rm.value)
               WHEN 'max'  THEN max(rm.value)
               WHEN 'min'  THEN min(rm.value)
               WHEN 'last' THEN max(rm.value)
               ELSE sum(rm.value)
             END                       AS value,
             count(*)::int             AS samples
        FROM result_metrics rm
        JOIN metrics m  ON m.id = rm.metric_id
        JOIN projects p ON p.id = rm.project_id
        LEFT JOIN clients c ON c.id = p.client_id
       WHERE ${scope}
         AND rm.metric_id = ${input.metricId}
         AND rm.recorded_for BETWEEN ${from} AND ${to}
         ${input.projectId ? sql`AND rm.project_id = ${input.projectId}` : sql``}
         ${input.clientId ? sql`AND rm.client_id = ${input.clientId}` : sql``}
         ${input.channelId ? sql`AND rm.channel_id = ${input.channelId}` : sql``}
         ${input.actionTypeId ? sql`AND rm.action_type_id = ${input.actionTypeId}` : sql``}
         ${
           input.recordedById
             ? sql`AND EXISTS (
                     SELECT 1 FROM results r
                      WHERE r.id = rm.result_id AND r.recorded_by = ${input.recordedById}
                   )`
             : sql``
}
       GROUP BY p.id, p.name, c.name, m.aggregation
       ORDER BY p.name
       LIMIT 200
    `)

    return (rows.rows as Record<string, unknown>[]).map((row) => ({
      projectId: String(row.project_id),
      projectName: String(row.project_name),
      clientName: row.client_name === null ? null : String(row.client_name),
      value: Number(row.value),
      samples: Number(row.samples),
    }))
  },
})

/**
 * What the filters may be set to.
 *
 * Scoped like everything else: a collaborator picks from THEIR projects, and
 * the clients of those projects. A filter listing a client the reader cannot
 * open is a leak dressed up as a dropdown.
 *
 * Sequential, not Promise.all: one transaction, one query at a time (ADR-044).
 */
export const listResultFilterOptions = defineQuery({
  permission: 'result.read',
  handler: async (_input: undefined, { actor, db }): Promise<FilterOptions> => {
    const visible = can(actor, 'project.read_all')
      ? undefined
      : sql`EXISTS (
          SELECT 1 FROM project_members pm
           WHERE pm.project_id = ${projects.id} AND pm.user_id = ${actor.userId}
        )`

    const projectRows = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(and(isNull(projects.deletedAt), visible))
      .orderBy(asc(projects.name))
      .limit(500)

    const clientRows = await db
      .selectDistinct({ id: clients.id, name: clients.name })
      .from(clients)
      .innerJoin(projects, eq(projects.clientId, clients.id))
      .where(and(isNull(projects.deletedAt), isNull(clients.deletedAt), visible))
      .orderBy(asc(clients.name))
      .limit(500)

    const channelRows = await db
      .select({ id: channels.id, labels: channels.labels })
      .from(channels)
      .where(eq(channels.isActive, true))
      .orderBy(asc(channels.sortOrder))

    const actionTypeRows = await db
      .select({ id: actionTypes.id, labels: actionTypes.labels })
      .from(actionTypes)
      .where(eq(actionTypes.isActive, true))
      .orderBy(asc(actionTypes.sortOrder))

    const peopleRows = await db
      .select({ id: users.id, name: users.name })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.status, 'active'), sql`${memberships.role} <> 'client'`))
      .orderBy(asc(users.name))
      .limit(500)

    return {
      projects: projectRows,
      clients: clientRows,
      channels: channelRows,
      actionTypes: actionTypeRows,
      people: peopleRows,
    }
  },
})

function shiftDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}
