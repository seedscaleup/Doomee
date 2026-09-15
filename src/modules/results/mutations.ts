'use server'

import { and, eq, isNull, sql } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import {
  actions,
  metrics,
  objectives,
  projects,
  resultFormFields,
  resultMetrics,
  resultNotes,
  results,
} from '@/db/schema'
import type { TenantDb } from '@/db/tenant'
import { AppError } from '@/lib/errors/app-error'
import { recordActivity } from '@/modules/activity'
import { computeGap, toNumber } from '@/modules/objectives'
import { defineAction } from '@/server'
import { answeredValues, buildFormSchema, type FormField } from './form-engine'
import { deleteResultSchema, recordResultSchema, resultNoteKindSchema } from './schemas'

export const recordResult = defineAction({
  input: recordResultSchema,
  permission: 'result.create',
  handler: async (input, { actor, db, audit }) => {
    const project = await requireProject(db, input.projectId)
    const fields = await loadTemplateFields(db, input.templateId)

    /**
     * The form is validated against ITS OWN template, at runtime (ADR-008).
     * The Zod schema in schemas.ts validates the envelope; it cannot know which
     * fields this template declares, and hard-coding them per trade is exactly
     * what the two tables exist to avoid.
     */
    const parsed = buildFormSchema(fields).safeParse(input.values)
    if (!parsed.success) throw new AppError('validation_failed', 'errors.result_values_invalid')

    const answered = answeredValues(parsed.data)
    const id = uuidv7()

    await db.insert(results).values({
      id,
      organizationId: actor.organizationId,
      projectId: input.projectId,
      actionId: input.actionId ?? null,
      objectiveId: input.objectiveId ?? null,
      templateId: input.templateId,
      title: input.title ?? null,
      recordedFor: input.recordedFor,
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
      analysis: input.analysis ?? null,
      recommendation: input.recommendation ?? null,
      recordedBy: actor.userId,
      isClientVisible: input.isClientVisible,
    })

    await writeMetrics(db, {
      organizationId: actor.organizationId,
      resultId: id,
      fields,
      answered,
      projectId: input.projectId,
      clientId: project.clientId,
      currency: project.budgetCurrency,
      actionId: input.actionId ?? null,
      objectiveId: input.objectiveId ?? null,
      recordedFor: input.recordedFor,
    })

    if (input.notes.length > 0) {
      await db.insert(resultNotes).values(
        input.notes.map((note, index) => ({
          id: uuidv7(),
          organizationId: actor.organizationId,
          resultId: id,
          kind: resultNoteKindSchema.parse(note.kind),
          body: note.body,
          sortOrder: (index + 1) * 10,
        })),
      )
    }

    /**
     * The objectives of this project are recomputed HERE, in the transaction
     * that recorded the result (ADR-013). That is what makes the "Résultat
     * réel" column of LOT 6 fill itself the moment a result lands, rather than
     * after a nightly job nobody watches.
     */
    await refreshObjectives(db, input.projectId)

    await recordActivity(db, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      verb: 'result.recorded',
      entityType: 'result',
      entityId: id,
      projectId: input.projectId,
      clientId: project.clientId,
      params: { name: input.title ?? project.name },
      visibility: input.isClientVisible ? 'shared' : 'internal',
    })

    await audit({
      action: 'result.recorded',
      entityType: 'result',
      entityId: id,
      after: {
        projectId: input.projectId,
        actionId: input.actionId ?? null,
        metrics: Object.keys(answered).length,
      },
    })

    return { id }
  },
})

export const deleteResult = defineAction({
  input: deleteResultSchema,
  permission: 'result.update_any',
  handler: async (input, { actor, db, audit }) => {
    const [existing] = await db
      .select({ id: results.id, projectId: results.projectId, title: results.title })
      .from(results)
      .where(and(eq(results.id, input.id), isNull(results.deletedAt)))
      .limit(1)

    if (!existing) throw new AppError('not_found', 'errors.not_found')

    await db
      .update(results)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(results.id, input.id))

    // The measurements go with it: result_metrics is append-only for UPDATE,
    // not for DELETE, precisely so a withdrawn result stops being counted.
    await db.delete(resultMetrics).where(eq(resultMetrics.resultId, input.id))
    await refreshObjectives(db, existing.projectId)

    await recordActivity(db, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      verb: 'result.deleted',
      entityType: 'result',
      entityId: input.id,
      projectId: existing.projectId,
      params: { name: existing.title ?? '' },
    })

    await audit({ action: 'result.deleted', entityType: 'result', entityId: input.id })

    return { id: input.id }
  },
})

/**
 * Writes one row per ANSWERED field that is wired to a metric.
 *
 * The dimensions are denormalised onto each row so the Results module can
 * filter by client, project, channel and action type without four joins per
 * chart (ADR-009).
 */
async function writeMetrics(
  db: TenantDb,
  input: {
    organizationId: string
    resultId: string
    fields: FormField[]
    answered: Record<string, string>
    projectId: string
    clientId: string | null
    currency: string | null
    actionId: string | null
    objectiveId: string | null
    recordedFor: string
  },
): Promise<void> {
  const wired = input.fields.filter((field) => field.metricId && input.answered[field.key])
  if (wired.length === 0) return

  let channelId: string | null = null
  let actionTypeId: string | null = null

  if (input.actionId) {
    const [action] = await db
      .select({ channelId: actions.channelId, actionTypeId: actions.actionTypeId })
      .from(actions)
      .where(eq(actions.id, input.actionId))
      .limit(1)

    channelId = action?.channelId ?? null
    actionTypeId = action?.actionTypeId ?? null
  }

  await db.insert(resultMetrics).values(
    wired.map((field) => ({
      id: uuidv7(),
      organizationId: input.organizationId,
      resultId: input.resultId,
      metricId: field.metricId as string,
      fieldKey: field.key,
      // Kept as the string the form sent: numeric(20,4) holds values a JS
      // number cannot, and this one is often money.
      value: input.answered[field.key] as string,
      unit: field.unit ?? null,
      /**
       * A money value carries its currency or it carries nothing (ADR-024).
       * The project's own budget currency is the only one this product knows;
       * inventing a default would produce amounts that look comparable and are
       * not, which is the exact failure ADR-024 exists to prevent.
       */
      currency: field.kind === 'currency' ? input.currency : null,
      objectiveId: input.objectiveId,
      projectId: input.projectId,
      clientId: input.clientId,
      channelId,
      actionTypeId,
      recordedFor: input.recordedFor,
    })),
  )
}

/**
 * Recomputes `current_value` and `achievement_percent` for every objective of a
 * project, from the metric rows themselves.
 *
 * Recomputed rather than incremented: an increment is right until the first
 * concurrent write and wrong forever after. Each objective is aggregated with
 * ITS metric's own aggregation — summing a rate would be nonsense (ADR-047).
 */
async function refreshObjectives(db: TenantDb, projectId: string): Promise<void> {
  const open = await db
    .select({
      id: objectives.id,
      metricId: objectives.metricId,
      targetValue: objectives.targetValue,
      currency: objectives.currency,
      periodStart: objectives.periodStart,
      periodEnd: objectives.periodEnd,
      aggregation: metrics.aggregation,
      direction: metrics.direction,
    })
    .from(objectives)
    .leftJoin(metrics, eq(metrics.id, objectives.metricId))
    .where(and(eq(objectives.projectId, projectId), isNull(objectives.deletedAt)))

  for (const objective of open) {
    if (!objective.metricId) continue

    /**
     * The aggregate function is chosen in TypeScript, not passed as a bind
     * parameter: `CASE $1 WHEN 'avg' …` gives PostgreSQL nothing to infer the
     * parameter's type from and fails outright. The value comes from an enum
     * column, and AGGREGATES maps it to a fixed identifier, so `sql.raw` here
     * is a lookup in a closed set rather than user input.
     */
    const aggregate = AGGREGATES[objective.aggregation ?? 'sum'] ?? 'sum'

    const aggregated = await db.execute(sql`
      SELECT ${sql.raw(aggregate)}(rm.value) AS total
        FROM result_metrics rm
        JOIN results r ON r.id = rm.result_id AND r.deleted_at IS NULL
       WHERE rm.metric_id = ${objective.metricId}
         AND (rm.objective_id = ${objective.id} OR (rm.objective_id IS NULL AND rm.project_id = ${projectId}))
         ${objective.periodStart ? sql`AND rm.recorded_for >= ${objective.periodStart}` : sql``}
         ${objective.periodEnd ? sql`AND rm.recorded_for <= ${objective.periodEnd}` : sql``}
    `)

    const total = (aggregated.rows[0] as { total: string | null } | undefined)?.total ?? null

    const gap = computeGap({
      targetValue: toNumber(objective.targetValue),
      currentValue: toNumber(total),
      direction: objective.direction ?? 'higher_is_better',
      targetCurrency: objective.currency,
      currentCurrency: objective.currency,
    })

    await db
      .update(objectives)
      .set({
        currentValue: total,
        // Null rather than a made-up number when the gap cannot be computed:
        // a percentage that means nothing is worse than an empty cell (ADR-046).
        achievementPercent: gap.computed ? gap.achievementPercent : null,
        updatedAt: new Date(),
      })
      .where(eq(objectives.id, objective.id))
  }
}

/**
 * A metric's aggregation, mapped to the SQL function that performs it.
 *
 * `last` uses max for now: results carry a date, and until an ordered
 * aggregate is needed the most recent value of a monotonic score is its
 * maximum. Named here rather than assumed at three call sites.
 */
const AGGREGATES: Record<string, string> = {
  sum: 'sum',
  avg: 'avg',
  max: 'max',
  min: 'min',
  last: 'max',
}

async function loadTemplateFields(db: TenantDb, templateId: string): Promise<FormField[]> {
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
    .where(eq(resultFormFields.templateId, templateId))
    .orderBy(resultFormFields.sortOrder)

  if (fields.length === 0) throw new AppError('not_found', 'errors.not_found')
  return fields
}

async function requireProject(db: TenantDb, projectId: string) {
  const [project] = await db
    .select({
      id: projects.id,
      name: projects.name,
      clientId: projects.clientId,
      budgetCurrency: projects.budgetCurrency,
    })
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
    .limit(1)

  if (!project) throw new AppError('not_found', 'errors.not_found')
  return project
}
