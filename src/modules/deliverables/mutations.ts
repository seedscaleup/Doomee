'use server'

import { and, desc, eq, isNull } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import { deliverableReviews, deliverables, deliverableVersions, files, projects } from '@/db/schema'
import type { TenantDb } from '@/db/tenant'
import { AppError } from '@/lib/errors/app-error'
import { recordActivity } from '@/modules/activity'
import { defineAction } from '@/server'
import {
  addVersionSchema,
  createDeliverableSchema,
  deleteDeliverableSchema,
  reviewSchema,
  transitionSchema,
  updateDeliverableSchema,
} from './schemas'
import {
  checkTransition,
  type DeliverableStatusValue,
  describesSomething,
  nextVersionNumber,
  type Side,
  statusAfterReview,
} from './service'

export const createDeliverable = defineAction({
  input: createDeliverableSchema,
  permission: 'deliverable.create',
  handler: async (input, { actor, db, audit }) => {
    await requireProject(db, input.projectId)

    const id = uuidv7()
    await db.insert(deliverables).values({
      id,
      organizationId: actor.organizationId,
      projectId: input.projectId,
      actionId: input.actionId ?? null,
      title: input.title,
      description: input.description ?? null,
      deliverableTypeId: input.deliverableTypeId ?? null,
      ownerUserId: input.ownerUserId ?? actor.userId,
      dueDate: input.dueDate ?? null,
      externalUrl: input.externalUrl ?? null,
      createdBy: actor.userId,
      updatedBy: actor.userId,
    })

    await recordActivity(db, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      verb: 'deliverable.created',
      entityType: 'deliverable',
      entityId: id,
      projectId: input.projectId,
      params: { name: input.title },
    })
    await audit({ action: 'deliverable.create', entityType: 'deliverable', entityId: id })

    return { id }
  },
})

export const updateDeliverable = defineAction({
  input: updateDeliverableSchema,
  permission: 'deliverable.create',
  handler: async (input, { actor, db, audit }) => {
    const before = await requireDeliverable(db, input.id)

    await db
      .update(deliverables)
      .set({
        title: input.title ?? before.title,
        description: input.description === undefined ? before.description : input.description,
        deliverableTypeId:
          input.deliverableTypeId === undefined
            ? before.deliverableTypeId
            : input.deliverableTypeId,
        ownerUserId: input.ownerUserId === undefined ? before.ownerUserId : input.ownerUserId,
        dueDate: input.dueDate === undefined ? before.dueDate : input.dueDate,
        externalUrl: input.externalUrl === undefined ? before.externalUrl : input.externalUrl,
        updatedBy: actor.userId,
        updatedAt: new Date(),
      })
      .where(eq(deliverables.id, input.id))

    await audit({
      action: 'deliverable.update',
      entityType: 'deliverable',
      entityId: input.id,
      before,
    })

    return { id: input.id }
  },
})

/**
 * A new iteration.
 *
 * The version row and the pointer that names it are written in ONE
 * transaction: a `current_version_id` that names a row which does not exist is
 * a detail page that 500s (ADR-013).
 */
export const addVersion = defineAction({
  input: addVersionSchema,
  permission: 'deliverable.create',
  handler: async (input, { actor, db, audit }) => {
    await requireDeliverable(db, input.deliverableId)

    if (!describesSomething(input)) {
      throw new AppError('validation_failed', 'errors.version_needs_content')
    }

    // The file must be OURS. The composite foreign key would refuse a foreign
    // one, but failing here says why instead of surfacing a constraint name.
    if (input.fileId) {
      const [file] = await db
        .select({ id: files.id })
        .from(files)
        .where(and(eq(files.id, input.fileId), isNull(files.deletedAt)))
        .limit(1)
      if (!file) throw new AppError('not_found', 'errors.file_not_found')
    }

    const existing = await db
      .select({ version: deliverableVersions.version })
      .from(deliverableVersions)
      .where(eq(deliverableVersions.deliverableId, input.deliverableId))

    const id = uuidv7()
    const version = nextVersionNumber(existing)

    await db.insert(deliverableVersions).values({
      id,
      organizationId: actor.organizationId,
      deliverableId: input.deliverableId,
      version,
      fileId: input.fileId ?? null,
      externalUrl: input.externalUrl ?? null,
      notes: input.notes ?? null,
      createdBy: actor.userId,
    })

    await db
      .update(deliverables)
      .set({ currentVersionId: id, updatedBy: actor.userId, updatedAt: new Date() })
      .where(eq(deliverables.id, input.deliverableId))

    await recordActivity(db, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      verb: 'deliverable.version_added',
      entityType: 'deliverable',
      entityId: input.deliverableId,
      params: { version },
    })
    await audit({
      action: 'deliverable.add_version',
      entityType: 'deliverable',
      entityId: input.deliverableId,
      after: { version },
    })

    return { id, version }
  },
})

/**
 * Moving the deliverable along its state machine.
 *
 * The INTERNAL side only. A move that belongs to the client is refused here
 * whatever the caller's role — `reviewAsClient` is the only door into
 * `approved` and `changes_requested`, and it asks the permission matrix for
 * `deliverable.approve`, which no internal role holds.
 */
export const transitionDeliverable = defineAction({
  input: transitionSchema,
  permission: 'deliverable.review_internal',
  handler: async (input, { actor, db, audit }) => {
    const before = await requireDeliverable(db, input.id)
    assertTransition(before.status, input.to, 'internal')

    // Sending to the client is what makes it visible. The flag is not set by a
    // checkbox somewhere else: the act and the exposure are the same decision.
    const sending = input.to === 'client_review'
    if (sending && !before.currentVersionId) {
      throw new AppError('validation_failed', 'errors.nothing_to_send')
    }

    await db
      .update(deliverables)
      .set({
        status: input.to,
        isClientVisible: sending ? true : before.isClientVisible,
        sentToClientAt: sending ? new Date() : before.sentToClientAt,
        publishedAt: input.to === 'published' ? new Date() : before.publishedAt,
        updatedBy: actor.userId,
        updatedAt: new Date(),
      })
      .where(eq(deliverables.id, input.id))

    await recordActivity(db, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      verb: `deliverable.${input.to}`,
      entityType: 'deliverable',
      entityId: input.id,
      params: { name: before.title },
      // A client learns that their deliverable arrived; the rest is internal.
      visibility: sending ? 'shared' : 'internal',
    })
    await audit({
      action: 'deliverable.transition',
      entityType: 'deliverable',
      entityId: input.id,
      before: { status: before.status },
      after: { status: input.to },
    })

    return { id: input.id, status: input.to }
  },
})

/**
 * The manager's verdict, recorded against the exact version.
 *
 * An internal approval does NOT send anything: it records that the team is
 * satisfied, and sending stays a separate, deliberate act (see the service).
 */
export const reviewInternally = defineAction({
  input: reviewSchema,
  permission: 'deliverable.review_internal',
  handler: async (input, { actor, db, audit }) => {
    return recordReview(db, {
      actor,
      audit,
      id: input.id,
      scope: 'internal',
      decision: input.decision,
      comment: input.comment ?? null,
    })
  },
})

/**
 * The client's verdict — the only way into `approved` or `changes_requested`.
 *
 * Guarded by `deliverable.approve`, which the permission matrix grants to the
 * `client` role and to nobody else. An agency that can approve its own work has
 * not built a validation step.
 */
export const reviewAsClient = defineAction({
  input: reviewSchema,
  permission: 'deliverable.approve',
  handler: async (input, { actor, db, audit }) => {
    return recordReview(db, {
      actor,
      audit,
      id: input.id,
      scope: 'client',
      decision: input.decision,
      comment: input.comment ?? null,
    })
  },
})

export const deleteDeliverable = defineAction({
  input: deleteDeliverableSchema,
  permission: 'deliverable.create',
  handler: async (input, { actor, db, audit }) => {
    const before = await requireDeliverable(db, input.id)

    // Logical deletion: the history of what was shown to a client outlives the
    // decision to stop showing it.
    await db
      .update(deliverables)
      .set({ deletedAt: new Date(), updatedBy: actor.userId })
      .where(eq(deliverables.id, input.id))

    await audit({
      action: 'deliverable.delete',
      entityType: 'deliverable',
      entityId: input.id,
      before: { title: before.title, status: before.status },
    })

    return { id: input.id }
  },
})

/**
 * ============================================================================
 * The shared half of the two review actions.
 *
 * One function, so an internal decision and a client decision cannot drift
 * apart in what they record — only in who is allowed to make them.
 * ============================================================================
 */
async function recordReview(
  db: TenantDb,
  input: {
    actor: { userId: string; organizationId: string }
    audit: (entry: {
      action: string
      entityType?: string
      entityId?: string
      before?: unknown
      after?: unknown
    }) => Promise<void>
    id: string
    scope: Side
    decision: 'approved' | 'changes_requested'
    comment: string | null
  },
) {
  const before = await requireDeliverable(db, input.id)

  /**
   * The review is ABOUT a version. Without one there is nothing to approve, and
   * a change request that names no version stops meaning anything the moment
   * the next one is uploaded.
   */
  const [version] = await db
    .select({ id: deliverableVersions.id, version: deliverableVersions.version })
    .from(deliverableVersions)
    .where(eq(deliverableVersions.deliverableId, input.id))
    .orderBy(desc(deliverableVersions.version))
    .limit(1)

  if (!version) throw new AppError('validation_failed', 'errors.nothing_to_review')

  const next = statusAfterReview(input.scope, input.decision)
  // A client decision moves the deliverable; an internal one may leave it where
  // it is. Either way the machine is asked, never bypassed.
  if (next !== before.status) assertTransition(before.status, next, input.scope)

  await db.insert(deliverableReviews).values({
    id: uuidv7(),
    organizationId: input.actor.organizationId,
    deliverableId: input.id,
    versionId: version.id,
    scope: input.scope,
    decision: input.decision,
    comment: input.comment,
    reviewerUserId: input.actor.userId,
  })

  await db
    .update(deliverables)
    .set({
      status: next,
      approvedAt: next === 'approved' ? new Date() : before.approvedAt,
      approvedBy: next === 'approved' ? input.actor.userId : before.approvedBy,
      updatedBy: input.actor.userId,
      updatedAt: new Date(),
    })
    .where(eq(deliverables.id, input.id))

  await recordActivity(db, {
    organizationId: input.actor.organizationId,
    actorUserId: input.actor.userId,
    verb: `deliverable.${input.scope}_${input.decision}`,
    entityType: 'deliverable',
    entityId: input.id,
    params: { name: before.title, version: version.version },
    // A client's own decision is theirs to see again; an internal one is not.
    visibility: input.scope === 'client' ? 'shared' : 'internal',
  })
  await input.audit({
    action: `deliverable.review_${input.scope}`,
    entityType: 'deliverable',
    entityId: input.id,
    before: { status: before.status },
    after: { status: next, decision: input.decision, version: version.version },
  })

  return { id: input.id, status: next }
}

/**
 * The state machine, consulted — never worked around.
 *
 * The refusal carries its REASON so the screen can say why (ADR-041): "you
 * cannot approve your own deliverable" and "a draft cannot be published" are
 * different problems and deserve different sentences.
 */
function assertTransition(
  from: DeliverableStatusValue,
  to: DeliverableStatusValue,
  by: Side,
): void {
  const verdict = checkTransition(from, to, by)
  if (verdict.ok) return

  if (verdict.reason === 'wrong_side') {
    throw new AppError('forbidden', 'errors.deliverable_wrong_side')
  }
  if (verdict.reason === 'terminal') {
    throw new AppError('validation_failed', 'errors.deliverable_published')
  }
  throw new AppError('validation_failed', 'errors.deliverable_transition_illegal')
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

async function requireDeliverable(db: TenantDb, id: string) {
  const [row] = await db
    .select({
      id: deliverables.id,
      title: deliverables.title,
      status: deliverables.status,
      description: deliverables.description,
      deliverableTypeId: deliverables.deliverableTypeId,
      ownerUserId: deliverables.ownerUserId,
      dueDate: deliverables.dueDate,
      externalUrl: deliverables.externalUrl,
      currentVersionId: deliverables.currentVersionId,
      isClientVisible: deliverables.isClientVisible,
      sentToClientAt: deliverables.sentToClientAt,
      approvedAt: deliverables.approvedAt,
      approvedBy: deliverables.approvedBy,
      publishedAt: deliverables.publishedAt,
    })
    .from(deliverables)
    .where(and(eq(deliverables.id, id), isNull(deliverables.deletedAt)))
    .limit(1)

  if (!row) throw new AppError('not_found', 'errors.deliverable_not_found')
  return row
}
