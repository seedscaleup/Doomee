import 'server-only'

import { and, asc, eq, isNull, type SQL, sql } from 'drizzle-orm'
import { z } from 'zod'
import { metrics, objectives, objectiveTypes, projects, users } from '@/db/schema'
import { type Actor, can } from '@/lib/permissions'
import { defineQuery } from '@/server'
import { listObjectivesSchema } from './schemas'
import type { MetricOption, ObjectiveRow, TaxonomyOption } from './types'

/**
 * The project scope, one level down (ADR-038): an objective is readable when
 * its project is. Written once and used by every read here, as everywhere else.
 */
function withinVisibleProjects(actor: Actor): SQL | undefined {
  if (can(actor, 'project.read_all')) return undefined

  return sql`EXISTS (
    SELECT 1 FROM project_members pm
     WHERE pm.project_id = ${objectives.projectId}
       AND pm.user_id = ${actor.userId}
  )`
}

const OBJECTIVE_COLUMNS = {
  id: objectives.id,
  title: objectives.title,
  description: objectives.description,
  status: objectives.status,
  projectId: objectives.projectId,
  projectName: projects.name,
  objectiveTypeId: objectives.objectiveTypeId,
  objectiveTypeLabels: objectiveTypes.labels,
  metricId: objectives.metricId,
  metricLabels: metrics.labels,
  metricDirection: metrics.direction,
  metricKind: metrics.kind,
  metricDecimals: metrics.decimals,
  targetValue: objectives.targetValue,
  currentValue: objectives.currentValue,
  unit: objectives.unit,
  currency: objectives.currency,
  periodStart: objectives.periodStart,
  periodEnd: objectives.periodEnd,
  ownerUserId: objectives.ownerUserId,
  ownerName: users.name,
  isClientVisible: objectives.isClientVisible,
  achievementPercent: objectives.achievementPercent,
}

export const listObjectives = defineQuery({
  input: listObjectivesSchema,
  permission: 'objective.read',
  handler: async (input, { actor, db }): Promise<ObjectiveRow[]> => {
    const filters: (SQL | undefined)[] = [
      isNull(objectives.deletedAt),
      withinVisibleProjects(actor),
    ]

    if (input.projectId) filters.push(eq(objectives.projectId, input.projectId))
    if (input.status) filters.push(eq(objectives.status, input.status))
    if (!input.includeClosed) filters.push(sql`${objectives.status} <> 'cancelled'`)

    return (
      db
        .select(OBJECTIVE_COLUMNS)
        .from(objectives)
        .innerJoin(projects, eq(projects.id, objectives.projectId))
        .leftJoin(objectiveTypes, eq(objectiveTypes.id, objectives.objectiveTypeId))
        .leftJoin(metrics, eq(metrics.id, objectives.metricId))
        .leftJoin(users, eq(users.id, objectives.ownerUserId))
        .where(and(...filters))
        // Soonest deadline first: an objective ending this month matters more
        // than one ending next year, whatever its title.
        .orderBy(sql`${objectives.periodEnd} ASC NULLS LAST`, asc(objectives.title))
        .limit(200)
    )
  },
})

export const getObjective = defineQuery({
  input: z.object({ id: z.uuid() }),
  permission: 'objective.read',
  handler: async (input, { actor, db }) => {
    const rows = await db
      .select(OBJECTIVE_COLUMNS)
      .from(objectives)
      .innerJoin(projects, eq(projects.id, objectives.projectId))
      .leftJoin(objectiveTypes, eq(objectiveTypes.id, objectives.objectiveTypeId))
      .leftJoin(metrics, eq(metrics.id, objectives.metricId))
      .leftJoin(users, eq(users.id, objectives.ownerUserId))
      .where(
        and(
          eq(objectives.id, input.id),
          isNull(objectives.deletedAt),
          withinVisibleProjects(actor),
        ),
      )
      .limit(1)

    return rows[0] ?? null
  },
})

/**
 * The metric catalogue, system rows included.
 *
 * Computed metrics are offered too: an objective on CTR is legitimate, and LOT
 * 7 will fill its current value by deriving it rather than by asking anyone to
 * type it.
 */
export const listMetrics = defineQuery({
  permission: 'objective.read',
  handler: async (_input: undefined, { db }): Promise<MetricOption[]> => {
    return db
      .select({
        id: metrics.id,
        code: metrics.code,
        labels: metrics.labels,
        unit: metrics.unit,
        kind: metrics.kind,
        direction: metrics.direction,
        decimals: metrics.decimals,
        isComputed: metrics.isComputed,
      })
      .from(metrics)
      .where(eq(metrics.isActive, true))
      .orderBy(asc(metrics.sortOrder))
      .limit(500)
  },
})

export const listObjectiveTypes = defineQuery({
  permission: 'objective.read',
  handler: async (_input: undefined, { db }): Promise<TaxonomyOption[]> => {
    return db
      .select({ id: objectiveTypes.id, code: objectiveTypes.code, labels: objectiveTypes.labels })
      .from(objectiveTypes)
      .where(eq(objectiveTypes.isActive, true))
      .orderBy(asc(objectiveTypes.sortOrder))
      .limit(200)
  },
})
