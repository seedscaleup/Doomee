'use server'

import { and, eq, inArray, isNull } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import { actions, insightActions, insightResults, insights, projects, results } from '@/db/schema'
import type { TenantDb } from '@/db/tenant'
import { AppError } from '@/lib/errors/app-error'
import { recordActivity } from '@/modules/activity'
import { defineAction } from '@/server'
import {
  createInsightSchema,
  createNextActionSchema,
  deleteInsightSchema,
  updateInsightSchema,
} from './schemas'
import { canProduceAction } from './service'

export const createInsight = defineAction({
  input: createInsightSchema,
  permission: 'insight.create',
  handler: async (input, { actor, db, audit }) => {
    if (input.projectId) await requireProject(db, input.projectId)

    const id = uuidv7()
    await db.insert(insights).values({
      id,
      organizationId: actor.organizationId,
      projectId: input.projectId ?? null,
      clientId: input.clientId ?? null,
      title: input.title,
      whatWorked: input.whatWorked ?? null,
      whatDidnt: input.whatDidnt ?? null,
      whatWeLearned: input.whatWeLearned ?? null,
      recommendation: input.recommendation ?? null,
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
      isClientVisible: input.isClientVisible,
      createdBy: actor.userId,
      updatedBy: actor.userId,
    })

    await linkResults(db, actor.organizationId, id, input.resultIds)

    await recordActivity(db, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      verb: 'insight.created',
      entityType: 'insight',
      entityId: id,
      projectId: input.projectId ?? null,
      clientId: input.clientId ?? null,
      params: { name: input.title },
    })
    await audit({ action: 'insight.create', entityType: 'insight', entityId: id })

    return { id }
  },
})

export const updateInsight = defineAction({
  input: updateInsightSchema,
  permission: 'insight.create',
  handler: async (input, { actor, db, audit }) => {
    const before = await requireInsight(db, input.id)

    await db
      .update(insights)
      .set({
        title: input.title ?? before.title,
        whatWorked: pick(input.whatWorked, before.whatWorked),
        whatDidnt: pick(input.whatDidnt, before.whatDidnt),
        whatWeLearned: pick(input.whatWeLearned, before.whatWeLearned),
        recommendation: pick(input.recommendation, before.recommendation),
        periodStart: pick(input.periodStart, before.periodStart),
        periodEnd: pick(input.periodEnd, before.periodEnd),
        isClientVisible: input.isClientVisible ?? before.isClientVisible,
        updatedBy: actor.userId,
        updatedAt: new Date(),
      })
      .where(eq(insights.id, input.id))

    if (input.resultIds) {
      // Replaced wholesale rather than diffed: the caller sends the list it
      // wants, and a diff would need an ordering nobody maintains.
      await db.delete(insightResults).where(eq(insightResults.insightId, input.id))
      await linkResults(db, actor.organizationId, input.id, input.resultIds)
    }

    await audit({
      action: 'insight.update',
      entityType: 'insight',
      entityId: input.id,
      before: { title: before.title },
    })

    return { id: input.id }
  },
})

/**
 * ============================================================================
 * `Create next action` — THE LAST EDGE OF THE LOOP.
 *
 * This single function is what makes Doomee a loop rather than a list of
 * screens. A recommendation that nobody can act on in one click is a
 * recommendation that stays in a document.
 *
 * Three writes, ONE transaction: the action, the join row, and the action's
 * own back-pointer. A next action that exists without its link would be
 * indistinguishable from any other task, and the claim "this came out of that
 * insight" would quietly stop being checkable.
 * ============================================================================
 */
export const createNextAction = defineAction({
  input: createNextActionSchema,
  permission: 'insight.convert_to_action',
  handler: async (input, { actor, db, audit }) => {
    const insight = await requireInsight(db, input.insightId)

    // The button is hidden without a recommendation; the server refuses it
    // anyway. An action invented from nothing is not a next action.
    if (!canProduceAction(insight)) {
      throw new AppError('validation_failed', 'errors.insight_no_recommendation')
    }

    await requireProject(db, input.projectId)

    const id = uuidv7()
    await db.insert(actions).values({
      id,
      organizationId: actor.organizationId,
      projectId: input.projectId,
      title: input.title,
      status: 'todo',
      priority: 'normal',
      assigneeId: input.assigneeId ?? null,
      dueDate: input.dueDate ?? null,
      sourceInsightId: input.insightId,
      createdBy: actor.userId,
      updatedBy: actor.userId,
    })

    await db.insert(insightActions).values({
      organizationId: actor.organizationId,
      insightId: input.insightId,
      actionId: id,
    })

    await recordActivity(db, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      verb: 'insight.action_created',
      entityType: 'insight',
      entityId: input.insightId,
      projectId: input.projectId,
      params: { name: input.title },
    })
    await audit({
      action: 'insight.convert_to_action',
      entityType: 'insight',
      entityId: input.insightId,
      after: { actionId: id, title: input.title },
    })

    return { actionId: id }
  },
})

export const deleteInsight = defineAction({
  input: deleteInsightSchema,
  permission: 'insight.create',
  handler: async (input, { actor, db, audit }) => {
    const before = await requireInsight(db, input.id)

    // Logical deletion. The actions it gave rise to survive it — the work was
    // done; only the reasoning is being withdrawn (the FK is ON DELETE SET
    // NULL for the same reason).
    await db
      .update(insights)
      .set({ deletedAt: new Date(), updatedBy: actor.userId })
      .where(eq(insights.id, input.id))

    await audit({
      action: 'insight.delete',
      entityType: 'insight',
      entityId: input.id,
      before: { title: before.title },
    })

    return { id: input.id }
  },
})

/**
 * Attaches the results an insight is built on.
 *
 * Every id is checked to be OURS first. The composite foreign key would refuse
 * a foreign one anyway; failing here says which, instead of surfacing a
 * constraint name.
 */
async function linkResults(
  db: TenantDb,
  organizationId: string,
  insightId: string,
  resultIds: readonly string[],
): Promise<void> {
  if (resultIds.length === 0) return

  const owned = await db
    .select({ id: results.id })
    .from(results)
    .where(and(inArray(results.id, [...resultIds]), isNull(results.deletedAt)))

  if (owned.length !== resultIds.length) {
    throw new AppError('not_found', 'errors.result_not_found')
  }

  await db.insert(insightResults).values(
    owned.map((result) => ({
      organizationId,
      insightId,
      resultId: result.id,
    })),
  )
}

/** `undefined` means "not sent"; `null` means "cleared". They are not the same. */
function pick<T>(incoming: T | null | undefined, current: T | null): T | null {
  return incoming === undefined ? current : (incoming ?? null)
}

async function requireProject(db: TenantDb, projectId: string) {
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
    .limit(1)

  if (!project) throw new AppError('not_found', 'errors.project_not_found')
  return project
}

async function requireInsight(db: TenantDb, id: string) {
  const [row] = await db
    .select({
      id: insights.id,
      title: insights.title,
      whatWorked: insights.whatWorked,
      whatDidnt: insights.whatDidnt,
      whatWeLearned: insights.whatWeLearned,
      recommendation: insights.recommendation,
      periodStart: insights.periodStart,
      periodEnd: insights.periodEnd,
      isClientVisible: insights.isClientVisible,
      projectId: insights.projectId,
    })
    .from(insights)
    .where(and(eq(insights.id, id), isNull(insights.deletedAt)))
    .limit(1)

  if (!row) throw new AppError('not_found', 'errors.insight_not_found')
  return row
}
