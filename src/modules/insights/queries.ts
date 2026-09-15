import 'server-only'

import { and, asc, desc, eq, ilike, isNull, or, type SQL, sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  actions,
  clients,
  insightActions,
  insightResults,
  insights,
  projects,
  results,
  users,
} from '@/db/schema'
import type { TenantDb } from '@/db/tenant'
import { type Actor, can } from '@/lib/permissions'
import { defineQuery } from '@/server'
import { listInsightsSchema } from './schemas'
import type { LoopCounts } from './service'
import type {
  ClientOption,
  InsightRow,
  LinkedActionRow,
  LinkedResultRow,
  ProjectOption,
  ResultOption,
} from './types'

/**
 * The collaborator scope, once more (ADR-038).
 *
 * An insight with no project belongs to the organisation rather than to a
 * team, so it is readable by anyone who may read insights at all — that is
 * what "a lesson about our own practice" means.
 */
function withinVisibleProjects(actor: Actor): SQL | undefined {
  if (can(actor, 'project.read_all')) return undefined

  return sql`(
    ${insights.projectId} IS NULL
    OR EXISTS (
      SELECT 1 FROM project_members pm
       WHERE pm.project_id = ${insights.projectId} AND pm.user_id = ${actor.userId}
    )
  )`
}

const INSIGHT_COLUMNS = {
  id: insights.id,
  title: insights.title,
  projectId: insights.projectId,
  projectName: projects.name,
  clientId: insights.clientId,
  clientName: clients.name,
  whatWorked: insights.whatWorked,
  whatDidnt: insights.whatDidnt,
  whatWeLearned: insights.whatWeLearned,
  recommendation: insights.recommendation,
  periodStart: insights.periodStart,
  periodEnd: insights.periodEnd,
  isClientVisible: insights.isClientVisible,
  authorName: users.name,
  createdAt: sql<string>`to_char(${insights.createdAt}, 'YYYY-MM-DD"T"HH24:MI:SSOF')`,
  resultCount: sql<number>`(
    SELECT count(*)::int FROM insight_results ir WHERE ir.insight_id = ${insights.id}
  )`,
  actionCount: sql<number>`(
    SELECT count(*)::int FROM insight_actions ia WHERE ia.insight_id = ${insights.id}
  )`,
}

export const listInsights = defineQuery({
  input: listInsightsSchema,
  permission: 'insight.read',
  handler: async (input, { actor, db }): Promise<InsightRow[]> => {
    const filters: (SQL | undefined)[] = [isNull(insights.deletedAt), withinVisibleProjects(actor)]

    if (input.projectId) filters.push(eq(insights.projectId, input.projectId))
    if (input.clientId) {
      // An insight reaches a client either directly or through its project.
      const match = or(eq(insights.clientId, input.clientId), eq(projects.clientId, input.clientId))
      if (match) filters.push(match)
    }
    if (input.from) filters.push(sql`${insights.createdAt} >= ${input.from}::date`)
    if (input.to) filters.push(sql`${insights.createdAt} < (${input.to}::date + 1)`)

    if (input.search) {
      const needle = `%${input.search}%`
      const match = or(
        sql`unaccent(${insights.title}) ILIKE unaccent(${needle})`,
        ilike(insights.whatWeLearned, needle),
        ilike(insights.recommendation, needle),
      )
      if (match) filters.push(match)
    }

    return db
      .select(INSIGHT_COLUMNS)
      .from(insights)
      .leftJoin(projects, eq(projects.id, insights.projectId))
      .leftJoin(clients, or(eq(clients.id, insights.clientId), eq(clients.id, projects.clientId)))
      .leftJoin(users, eq(users.id, insights.createdBy))
      .where(and(...filters))
      .orderBy(desc(insights.createdAt))
      .limit(input.limit)
  },
})

export const getInsight = defineQuery({
  input: z.object({ id: z.uuid() }),
  permission: 'insight.read',
  handler: async (input, { actor, db }): Promise<InsightRow | null> => {
    const rows = await db
      .select(INSIGHT_COLUMNS)
      .from(insights)
      .leftJoin(projects, eq(projects.id, insights.projectId))
      .leftJoin(clients, or(eq(clients.id, insights.clientId), eq(clients.id, projects.clientId)))
      .leftJoin(users, eq(users.id, insights.createdBy))
      .where(
        and(eq(insights.id, input.id), isNull(insights.deletedAt), withinVisibleProjects(actor)),
      )
      .limit(1)

    return rows[0] ?? null
  },
})

/** The results an insight is BUILT ON — what separates a finding from an opinion. */
export const listInsightResults = defineQuery({
  input: z.object({ insightId: z.uuid() }),
  permission: 'insight.read',
  handler: async (input, { actor, db }): Promise<LinkedResultRow[]> => {
    if (!(await insightIsVisible(db, actor, input.insightId))) return []

    return db
      .select({
        id: results.id,
        title: results.title,
        recordedFor: results.recordedFor,
        projectName: projects.name,
      })
      .from(insightResults)
      .innerJoin(results, eq(results.id, insightResults.resultId))
      .innerJoin(projects, eq(projects.id, results.projectId))
      .where(eq(insightResults.insightId, input.insightId))
      .orderBy(desc(results.recordedFor))
  },
})

/** The actions it gave rise to — the loop closing. */
export const listInsightActions = defineQuery({
  input: z.object({ insightId: z.uuid() }),
  permission: 'insight.read',
  handler: async (input, { actor, db }): Promise<LinkedActionRow[]> => {
    if (!(await insightIsVisible(db, actor, input.insightId))) return []

    return db
      .select({
        id: actions.id,
        title: actions.title,
        status: actions.status,
        assigneeName: users.name,
      })
      .from(insightActions)
      .innerJoin(actions, eq(actions.id, insightActions.actionId))
      .leftJoin(users, eq(users.id, actions.assigneeId))
      .where(eq(insightActions.insightId, input.insightId))
      .orderBy(asc(actions.title))
  },
})

/**
 * ============================================================================
 * THE LOOP, counted for one project.
 *
 * Six counts in one round trip, because this renders on the project screen and
 * six queries there would be six round trips for one strip of dots.
 *
 * `nextAction` counts actions BORN of an insight, not actions in general: the
 * last edge of the loop is what makes it a loop rather than a list.
 * ============================================================================
 */
export const readProjectLoop = defineQuery({
  input: z.object({ projectId: z.uuid() }),
  permission: 'project.read',
  handler: async (input, { db }): Promise<LoopCounts> => {
    const rows = await db.execute(sql`
      SELECT
        (SELECT count(*)::int FROM objectives o
          WHERE o.project_id = ${input.projectId} AND o.deleted_at IS NULL)     AS objective,
        (SELECT count(*)::int FROM actions a
          WHERE a.project_id = ${input.projectId} AND a.deleted_at IS NULL)     AS action,
        (SELECT count(*)::int FROM deliverables d
          WHERE d.project_id = ${input.projectId} AND d.deleted_at IS NULL)     AS deliverable,
        (SELECT count(*)::int FROM results r
          WHERE r.project_id = ${input.projectId} AND r.deleted_at IS NULL)     AS result,
        (SELECT count(*)::int FROM insights i
          WHERE i.project_id = ${input.projectId} AND i.deleted_at IS NULL)     AS insight,
        (SELECT count(*)::int FROM actions a
          WHERE a.project_id = ${input.projectId} AND a.deleted_at IS NULL
            AND a.source_insight_id IS NOT NULL)                                AS next_action
    `)

    const row = (rows.rows[0] ?? {}) as Record<string, unknown>
    return {
      objective: Number(row.objective ?? 0),
      action: Number(row.action ?? 0),
      deliverable: Number(row.deliverable ?? 0),
      result: Number(row.result ?? 0),
      insight: Number(row.insight ?? 0),
      nextAction: Number(row.next_action ?? 0),
    }
  },
})

/** Which results an insight may be built on — scoped like everything else. */
export const listResultOptions = defineQuery({
  input: z.object({ projectId: z.uuid().optional() }),
  permission: 'insight.create',
  handler: async (input, { actor, db }): Promise<ResultOption[]> => {
    const scope = can(actor, 'project.read_all')
      ? undefined
      : sql`EXISTS (
          SELECT 1 FROM project_members pm
           WHERE pm.project_id = ${results.projectId} AND pm.user_id = ${actor.userId}
        )`

    const rows = await db
      .select({
        id: results.id,
        title: results.title,
        recordedFor: results.recordedFor,
        projectId: results.projectId,
        projectName: projects.name,
      })
      .from(results)
      .innerJoin(projects, eq(projects.id, results.projectId))
      .where(
        and(
          isNull(results.deletedAt),
          input.projectId ? eq(results.projectId, input.projectId) : undefined,
          scope,
        ),
      )
      .orderBy(desc(results.recordedFor))
      .limit(200)

    return rows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      label: `${row.recordedFor} — ${row.title ?? row.projectName}`,
    }))
  },
})

export const listInsightScopes = defineQuery({
  permission: 'insight.create',
  handler: async (
    _input: undefined,
    { actor, db },
  ): Promise<{ projects: ProjectOption[]; clients: ClientOption[] }> => {
    const scope = can(actor, 'project.read_all')
      ? undefined
      : sql`EXISTS (
          SELECT 1 FROM project_members pm
           WHERE pm.project_id = ${projects.id} AND pm.user_id = ${actor.userId}
        )`

    // Sequential: one transaction, one query at a time (ADR-044).
    const projectRows = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(and(isNull(projects.deletedAt), scope))
      .orderBy(asc(projects.name))
      .limit(500)

    const clientRows = await db
      .selectDistinct({ id: clients.id, name: clients.name })
      .from(clients)
      .innerJoin(projects, eq(projects.clientId, clients.id))
      .where(and(isNull(clients.deletedAt), isNull(projects.deletedAt), scope))
      .orderBy(asc(clients.name))
      .limit(500)

    return { projects: projectRows, clients: clientRows }
  },
})

async function insightIsVisible(db: TenantDb, actor: Actor, id: string): Promise<boolean> {
  const [found] = await db
    .select({ id: insights.id })
    .from(insights)
    .where(and(eq(insights.id, id), isNull(insights.deletedAt), withinVisibleProjects(actor)))
    .limit(1)

  return Boolean(found)
}
