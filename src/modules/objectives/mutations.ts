'use server'

import { and, eq, isNull } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import { objectives, projects } from '@/db/schema'
import type { TenantDb } from '@/db/tenant'
import { AppError } from '@/lib/errors/app-error'
import { recordActivity } from '@/modules/activity'
import { defineAction } from '@/server'
import { createObjectiveSchema, deleteObjectiveSchema, updateObjectiveSchema } from './schemas'
import { canTransition } from './service'

export const createObjective = defineAction({
  input: createObjectiveSchema,
  permission: 'objective.create',
  handler: async (input, { actor, db, audit }) => {
    const project = await requireProject(db, input.projectId)
    const id = uuidv7()

    await db.insert(objectives).values({
      id,
      organizationId: actor.organizationId,
      projectId: input.projectId,
      objectiveTypeId: input.objectiveTypeId ?? null,
      title: input.title,
      description: input.description ?? null,
      metricId: input.metricId ?? null,
      targetValue: input.targetValue ?? null,
      unit: input.unit ?? null,
      currency: input.currency ?? null,
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
      status: input.status,
      ownerUserId: input.ownerUserId ?? actor.userId,
      isClientVisible: input.isClientVisible,
      createdBy: actor.userId,
      updatedBy: actor.userId,
    })

    await recordActivity(db, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      verb: 'objective.created',
      entityType: 'objective',
      entityId: id,
      projectId: input.projectId,
      clientId: project.clientId,
      params: { name: input.title },
    })

    await audit({
      action: 'objective.created',
      entityType: 'objective',
      entityId: id,
      after: { title: input.title, projectId: input.projectId, metricId: input.metricId ?? null },
    })

    return { id }
  },
})

export const updateObjective = defineAction({
  input: updateObjectiveSchema,
  permission: 'objective.update',
  handler: async (input, { actor, db, audit }) => {
    const { id, ...changes } = input
    const existing = await requireObjective(db, id)

    if (changes.status && !canTransition(existing.status, changes.status)) {
      throw new AppError('conflict', 'errors.invalid_transition')
    }

    await db
      .update(objectives)
      .set({ ...changes, updatedBy: actor.userId, updatedAt: new Date() })
      .where(eq(objectives.id, id))

    await recordActivity(db, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      verb: statusVerb(changes.status, existing.status),
      entityType: 'objective',
      entityId: id,
      projectId: existing.projectId,
      clientId: existing.clientId,
      params: { name: changes.title ?? existing.title },
    })

    await audit({
      action: 'objective.updated',
      entityType: 'objective',
      entityId: id,
      before: { status: existing.status, targetValue: existing.targetValue },
      after: changes,
    })

    return { id }
  },
})

export const deleteObjective = defineAction({
  input: deleteObjectiveSchema,
  permission: 'objective.update',
  handler: async (input, { actor, db, audit }) => {
    const existing = await requireObjective(db, input.id)

    await db
      .update(objectives)
      .set({ deletedAt: new Date(), updatedBy: actor.userId, updatedAt: new Date() })
      .where(eq(objectives.id, input.id))

    await recordActivity(db, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      verb: 'objective.deleted',
      entityType: 'objective',
      entityId: input.id,
      projectId: existing.projectId,
      clientId: existing.clientId,
      params: { name: existing.title },
    })

    await audit({ action: 'objective.deleted', entityType: 'objective', entityId: input.id })

    return { id: input.id }
  },
})

/** Reaching a verdict is worth its own line in the history. */
function statusVerb(next: string | undefined, current: string): string {
  if (!next || next === current) return 'objective.updated'
  if (next === 'achieved') return 'objective.achieved'
  if (next === 'missed') return 'objective.missed'
  return 'objective.updated'
}

async function requireProject(db: TenantDb, projectId: string) {
  const [project] = await db
    .select({ id: projects.id, clientId: projects.clientId })
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
    .limit(1)

  if (!project) throw new AppError('not_found', 'errors.not_found')
  return project
}

async function requireObjective(db: TenantDb, id: string) {
  const [objective] = await db
    .select({
      id: objectives.id,
      title: objectives.title,
      status: objectives.status,
      targetValue: objectives.targetValue,
      projectId: objectives.projectId,
      clientId: projects.clientId,
    })
    .from(objectives)
    .innerJoin(projects, eq(projects.id, objectives.projectId))
    .where(and(eq(objectives.id, id), isNull(objectives.deletedAt)))
    .limit(1)

  if (!objective) throw new AppError('not_found', 'errors.not_found')
  return objective
}
