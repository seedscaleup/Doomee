'use server'

import { and, eq, isNull, sql } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import { milestones, projectMembers, projects } from '@/db/schema'
import type { TenantDb } from '@/db/tenant'
import { AppError } from '@/lib/errors/app-error'
import { recordActivity } from '@/modules/activity'
import { defineAction } from '@/server'
import {
  addProjectMemberSchema,
  archiveProjectSchema,
  createMilestoneSchema,
  createProjectSchema,
  deleteMilestoneSchema,
  reachMilestoneSchema,
  removeProjectMemberSchema,
  updateProjectSchema,
} from './schemas'
import { canTransition, projectProgress } from './service'

export const createProject = defineAction({
  input: createProjectSchema,
  permission: 'project.create',
  handler: async (input, { actor, db, audit }) => {
    const id = uuidv7()
    const ownerUserId = input.ownerUserId ?? actor.userId

    await db.insert(projects).values({
      id,
      organizationId: actor.organizationId,
      clientId: input.clientId ?? null,
      name: input.name,
      code: input.code ?? null,
      description: input.description ?? null,
      status: input.status,
      priority: input.priority,
      color: input.color ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      // Inherited from the organisation at creation and then owned by the
      // project: moving the agency must not silently move every deadline (R9).
      timezone: input.timezone ?? 'UTC',
      ownerUserId,
      budgetAmount: input.budgetAmount ?? null,
      budgetCurrency: input.budgetCurrency ?? null,
      isClientVisible: input.isClientVisible,
      createdBy: actor.userId,
      updatedBy: actor.userId,
    })

    // The person accountable for a project is on its team by definition, and
    // making that implicit is how a lead ends up unable to see their own
    // project once they stop being a manager.
    await db.insert(projectMembers).values({
      id: uuidv7(),
      organizationId: actor.organizationId,
      projectId: id,
      userId: ownerUserId,
      role: 'lead',
      addedBy: actor.userId,
    })

    await recordActivity(db, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      verb: 'project.created',
      entityType: 'project',
      entityId: id,
      projectId: id,
      clientId: input.clientId ?? null,
      params: { name: input.name },
    })

    await audit({
      action: 'project.created',
      entityType: 'project',
      entityId: id,
      after: { name: input.name, status: input.status, clientId: input.clientId ?? null },
    })

    return { id }
  },
})

export const updateProject = defineAction({
  input: updateProjectSchema,
  permission: 'project.update',
  handler: async (input, { actor, db, audit }) => {
    const { id, ...changes } = input
    const existing = await requireProject(db, id)

    if (changes.status && !canTransition(existing.status, changes.status)) {
      throw new AppError('conflict', 'errors.invalid_transition')
    }

    await db
      .update(projects)
      .set({ ...changes, updatedBy: actor.userId, updatedAt: new Date() })
      .where(eq(projects.id, id))

    await recordActivity(db, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      verb: 'project.updated',
      entityType: 'project',
      entityId: id,
      projectId: id,
      clientId: existing.clientId,
      params: { name: changes.name ?? existing.name },
    })

    await audit({
      action: 'project.updated',
      entityType: 'project',
      entityId: id,
      before: { status: existing.status },
      after: changes,
    })

    return { id }
  },
})

export const archiveProject = defineAction({
  input: archiveProjectSchema,
  permission: 'project.archive',
  handler: async (input, { actor, db, audit }) => {
    const existing = await requireProject(db, input.id)

    await db
      .update(projects)
      .set({
        status: 'archived',
        archivedAt: new Date(),
        updatedBy: actor.userId,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, input.id))

    await recordActivity(db, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      verb: 'project.archived',
      entityType: 'project',
      entityId: input.id,
      projectId: input.id,
      clientId: existing.clientId,
      params: { name: existing.name },
    })

    await audit({ action: 'project.archived', entityType: 'project', entityId: input.id })

    return { id: input.id }
  },
})

export const addProjectMember = defineAction({
  input: addProjectMemberSchema,
  permission: 'project.update',
  handler: async (input, { actor, db, audit }) => {
    const project = await requireProject(db, input.projectId)

    await db
      .insert(projectMembers)
      .values({
        id: uuidv7(),
        organizationId: actor.organizationId,
        projectId: input.projectId,
        userId: input.userId,
        role: input.role,
        addedBy: actor.userId,
      })
      // Adding someone who is already on the team is not a failure to report.
      .onConflictDoUpdate({
        target: [projectMembers.organizationId, projectMembers.projectId, projectMembers.userId],
        set: { role: input.role },
      })

    await recordActivity(db, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      verb: 'project.member_added',
      entityType: 'project',
      entityId: input.projectId,
      projectId: input.projectId,
      clientId: project.clientId,
      params: { name: project.name },
    })

    await audit({
      action: 'project.member_added',
      entityType: 'project',
      entityId: input.projectId,
      after: { userId: input.userId, role: input.role },
    })

    return { projectId: input.projectId }
  },
})

export const removeProjectMember = defineAction({
  input: removeProjectMemberSchema,
  permission: 'project.update',
  handler: async (input, { actor, db, audit }) => {
    const project = await requireProject(db, input.projectId)

    // Removing the person accountable for the project would leave it with an
    // owner who cannot open it. Change the owner first, then remove them.
    if (project.ownerUserId === input.userId) {
      throw new AppError('conflict', 'errors.project_owner_is_member')
    }

    await db
      .delete(projectMembers)
      .where(
        and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, input.userId)),
      )

    await recordActivity(db, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      verb: 'project.member_removed',
      entityType: 'project',
      entityId: input.projectId,
      projectId: input.projectId,
      clientId: project.clientId,
      params: { name: project.name },
    })

    await audit({
      action: 'project.member_removed',
      entityType: 'project',
      entityId: input.projectId,
      before: { userId: input.userId },
    })

    return { projectId: input.projectId }
  },
})

export const createMilestone = defineAction({
  input: createMilestoneSchema,
  permission: 'project.update',
  handler: async (input, { actor, db, audit }) => {
    const project = await requireProject(db, input.projectId)
    const id = uuidv7()

    await db.insert(milestones).values({
      id,
      organizationId: actor.organizationId,
      projectId: input.projectId,
      title: input.title,
      description: input.description ?? null,
      dueDate: input.dueDate ?? null,
      isClientVisible: input.isClientVisible,
      createdBy: actor.userId,
    })

    await refreshProjectProgress(db, input.projectId)

    await recordActivity(db, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      verb: 'project.milestone_added',
      entityType: 'milestone',
      entityId: id,
      projectId: input.projectId,
      clientId: project.clientId,
      params: { name: input.title },
    })

    await audit({
      action: 'project.milestone_added',
      entityType: 'milestone',
      entityId: id,
      after: { title: input.title, dueDate: input.dueDate ?? null },
    })

    return { id }
  },
})

export const setMilestoneReached = defineAction({
  input: reachMilestoneSchema,
  permission: 'project.update',
  handler: async (input, { actor, db, audit }) => {
    const [existing] = await db
      .select({
        id: milestones.id,
        title: milestones.title,
        projectId: milestones.projectId,
        reachedAt: milestones.reachedAt,
      })
      .from(milestones)
      .where(and(eq(milestones.id, input.id), isNull(milestones.deletedAt)))
      .limit(1)

    if (!existing) throw new AppError('not_found', 'errors.not_found')

    await db
      .update(milestones)
      .set({
        reachedAt: input.reached ? new Date() : null,
        status: input.reached ? 'reached' : 'upcoming',
        updatedAt: new Date(),
      })
      .where(eq(milestones.id, input.id))

    await refreshProjectProgress(db, existing.projectId)

    await recordActivity(db, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      verb: input.reached ? 'project.milestone_reached' : 'project.milestone_reopened',
      entityType: 'milestone',
      entityId: input.id,
      projectId: existing.projectId,
      params: { name: existing.title },
    })

    await audit({
      action: input.reached ? 'project.milestone_reached' : 'project.milestone_reopened',
      entityType: 'milestone',
      entityId: input.id,
    })

    return { id: input.id }
  },
})

export const deleteMilestone = defineAction({
  input: deleteMilestoneSchema,
  permission: 'project.update',
  handler: async (input, { actor, db, audit }) => {
    const [existing] = await db
      .select({ id: milestones.id, title: milestones.title, projectId: milestones.projectId })
      .from(milestones)
      .where(and(eq(milestones.id, input.id), isNull(milestones.deletedAt)))
      .limit(1)

    if (!existing) throw new AppError('not_found', 'errors.not_found')

    await db
      .update(milestones)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(milestones.id, input.id))

    await refreshProjectProgress(db, existing.projectId)

    await recordActivity(db, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      verb: 'project.milestone_deleted',
      entityType: 'milestone',
      entityId: input.id,
      projectId: existing.projectId,
      params: { name: existing.title },
    })

    await audit({
      action: 'project.milestone_deleted',
      entityType: 'milestone',
      entityId: input.id,
    })

    return { id: input.id }
  },
})

/**
 * Reads the counts and writes the denormalised progress — IN THE CALLER'S
 * TRANSACTION.
 *
 * That is the whole contract of a denormalised column (ADR-013, R5): it is
 * recomputed by the mutation that invalidated it, and it commits or rolls back
 * with it. A number maintained "afterwards" is a number that is wrong between
 * the two, and lists read it constantly.
 *
 * The action counters are read here and stay at zero until LOT 5 creates
 * actions; the arithmetic that combines them already lives in the pure service,
 * so that lot adds rows, not rules.
 */
async function refreshProjectProgress(db: TenantDb, projectId: string): Promise<void> {
  const [counts] = await db
    .select({
      actionsTotal: projects.actionsTotal,
      actionsDone: projects.actionsDone,
      milestonesTotal: sql<number>`(
        SELECT count(*)::int FROM milestones m
         WHERE m.project_id = ${projectId} AND m.deleted_at IS NULL
      )`,
      milestonesReached: sql<number>`(
        SELECT count(*)::int FROM milestones m
         WHERE m.project_id = ${projectId} AND m.deleted_at IS NULL AND m.reached_at IS NOT NULL
      )`,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)

  if (!counts) return

  await db
    .update(projects)
    .set({ progressPercent: projectProgress(counts) })
    .where(eq(projects.id, projectId))
}

/** One lookup, one error, so every mutation fails the same way on a bad id. */
async function requireProject(db: TenantDb, id: string) {
  const [project] = await db
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      clientId: projects.clientId,
      ownerUserId: projects.ownerUserId,
    })
    .from(projects)
    .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
    .limit(1)

  if (!project) throw new AppError('not_found', 'errors.not_found')
  return project
}
