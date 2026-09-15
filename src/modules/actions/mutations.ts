'use server'

import { and, eq, isNull, sql } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import {
  actionCollaborators,
  actions,
  attachments,
  commentMentions,
  comments,
  projects,
} from '@/db/schema'
import type { TenantDb } from '@/db/tenant'
import { AppError } from '@/lib/errors/app-error'
import { type Actor, can } from '@/lib/permissions'
import { recordActivity } from '@/modules/activity'
import { extensionFor, inspectAttachment, storeFile } from '@/modules/files'
import { projectProgress } from '@/modules/projects'
import { type AuditEntry, defineAction } from '@/server'
import { mayEditAction } from './policy'
import {
  addCommentSchema,
  attachToActionSchema,
  changeActionStatusSchema,
  createActionSchema,
  deleteActionSchema,
  deleteCommentSchema,
  quickCreateActionSchema,
  setActionCollaboratorsSchema,
  updateActionSchema,
} from './schemas'
import { type ActionStatusValue, actionCounts, canTransition, checkBlocked } from './service'

/** Everything an insert may carry. Quick create simply fills in less of it. */
type NewAction = {
  projectId: string
  title: string
  assigneeId?: string
  dueDate?: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
  description?: string
  status?: ActionStatusValue
  actionTypeId?: string
  categoryId?: string
  channelId?: string
  startDate?: string
  estimatedMinutes?: number
  isClientVisible?: boolean
  blockedReason?: string
}

/**
 * Quick create — the path that has to be fast (rule 10, *less typing*).
 *
 * Title and project. The assignee defaults to whoever is creating, the status
 * to `todo`, the priority to `normal`. An action nobody has thought through is
 * still worth recording, and the form must not stand in the way of recording
 * it. The full form below is the same insert with more fields filled in, so
 * there is one set of rules rather than two that drift.
 */
export const quickCreateAction = defineAction({
  input: quickCreateActionSchema,
  permission: 'action.create',
  handler: async (input, context) => insertAction(input, context),
})

export const createAction = defineAction({
  input: createActionSchema,
  permission: 'action.create',
  handler: async (input, context) => insertAction(input, context),
})

async function insertAction(
  input: NewAction,
  { actor, db, audit }: { actor: Actor; db: TenantDb; audit: (entry: AuditEntry) => Promise<void> },
): Promise<{ id: string }> {
  const project = await requireProject(db, input.projectId)
  const id = uuidv7()
  const status = input.status ?? 'todo'

  const blocked = checkBlocked({ status, blockedReason: input.blockedReason })
  if (!blocked.ok) throw new AppError('validation_failed', 'errors.blocked_reason_required')

  await db.insert(actions).values({
    id,
    organizationId: actor.organizationId,
    projectId: input.projectId,
    title: input.title,
    description: input.description ?? null,
    status,
    priority: input.priority,
    actionTypeId: input.actionTypeId ?? null,
    categoryId: input.categoryId ?? null,
    channelId: input.channelId ?? null,
    assigneeId: input.assigneeId ?? actor.userId,
    startDate: input.startDate ?? null,
    dueDate: input.dueDate ?? null,
    estimatedMinutes: input.estimatedMinutes ?? null,
    isClientVisible: input.isClientVisible ?? false,
    blockedReason: input.blockedReason ?? null,
    completedAt: status === 'done' ? new Date() : null,
    createdBy: actor.userId,
    updatedBy: actor.userId,
  })

  await refreshProjectCounters(db, input.projectId, project.timezone)

  await recordActivity(db, {
    organizationId: actor.organizationId,
    actorUserId: actor.userId,
    verb: 'action.created',
    entityType: 'action',
    entityId: id,
    projectId: input.projectId,
    clientId: project.clientId,
    params: { name: input.title },
  })

  await audit({
    action: 'action.created',
    entityType: 'action',
    entityId: id,
    after: { title: input.title, projectId: input.projectId, status },
  })

  return { id }
}

export const updateAction = defineAction({
  input: updateActionSchema,
  permission: 'action.update_own',
  handler: async (input, { actor, db, audit }) => {
    const { id, ...changes } = input
    const existing = await requireEditableAction(db, actor, id)

    if (changes.status && !canTransition(existing.status, changes.status)) {
      throw new AppError('conflict', 'errors.invalid_transition')
    }

    const status = changes.status ?? existing.status
    const blockedReason = changes.blockedReason ?? existing.blockedReason
    const blocked = checkBlocked({ status, blockedReason })
    if (!blocked.ok) throw new AppError('validation_failed', 'errors.blocked_reason_required')

    await db
      .update(actions)
      .set({
        ...changes,
        // `completed_at` is derived from the status, never set by the form: two
        // places to say "this is finished" is one place to disagree.
        completedAt: completedAtFor(status, existing.completedAt),
        updatedBy: actor.userId,
        updatedAt: new Date(),
      })
      .where(eq(actions.id, id))

    await refreshProjectCounters(db, existing.projectId, existing.timezone)

    await recordActivity(db, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      verb:
        changes.status && changes.status !== existing.status
          ? statusVerb(status)
          : 'action.updated',
      entityType: 'action',
      entityId: id,
      projectId: existing.projectId,
      clientId: existing.clientId,
      params: { name: changes.title ?? existing.title },
    })

    await audit({
      action: 'action.updated',
      entityType: 'action',
      entityId: id,
      before: { status: existing.status },
      after: changes,
    })

    return { id }
  },
})

/** The one-click move a kanban column or a detail header makes. */
export const changeActionStatus = defineAction({
  input: changeActionStatusSchema,
  permission: 'action.update_own',
  handler: async (input, { actor, db, audit }) => {
    const existing = await requireEditableAction(db, actor, input.id)

    if (!canTransition(existing.status, input.status)) {
      throw new AppError('conflict', 'errors.invalid_transition')
    }

    const blockedReason = input.blockedReason ?? existing.blockedReason
    const blocked = checkBlocked({ status: input.status, blockedReason })
    if (!blocked.ok) throw new AppError('validation_failed', 'errors.blocked_reason_required')

    await db
      .update(actions)
      .set({
        status: input.status,
        // Leaving a stale reason on an unblocked action is how a board starts
        // lying about why nothing moved.
        blockedReason: input.status === 'blocked' ? (blockedReason ?? null) : null,
        completedAt: completedAtFor(input.status, existing.completedAt),
        updatedBy: actor.userId,
        updatedAt: new Date(),
      })
      .where(eq(actions.id, input.id))

    await refreshProjectCounters(db, existing.projectId, existing.timezone)

    await recordActivity(db, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      verb: statusVerb(input.status),
      entityType: 'action',
      entityId: input.id,
      projectId: existing.projectId,
      clientId: existing.clientId,
      params: { name: existing.title },
    })

    await audit({
      action: 'action.status_changed',
      entityType: 'action',
      entityId: input.id,
      before: { status: existing.status },
      after: { status: input.status },
    })

    return { id: input.id, status: input.status }
  },
})

export const deleteAction = defineAction({
  input: deleteActionSchema,
  permission: 'action.update_any',
  handler: async (input, { actor, db, audit }) => {
    const existing = await requireEditableAction(db, actor, input.id)

    await db
      .update(actions)
      .set({ deletedAt: new Date(), updatedBy: actor.userId, updatedAt: new Date() })
      .where(eq(actions.id, input.id))

    await refreshProjectCounters(db, existing.projectId, existing.timezone)

    await recordActivity(db, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      verb: 'action.deleted',
      entityType: 'action',
      entityId: input.id,
      projectId: existing.projectId,
      clientId: existing.clientId,
      params: { name: existing.title },
    })

    await audit({ action: 'action.deleted', entityType: 'action', entityId: input.id })

    return { id: input.id }
  },
})

/** The extra hands. Replaced wholesale, because that is how the form works. */
export const setActionCollaborators = defineAction({
  input: setActionCollaboratorsSchema,
  permission: 'action.update_own',
  handler: async (input, { actor, db, audit }) => {
    const existing = await requireEditableAction(db, actor, input.actionId)

    await db.delete(actionCollaborators).where(eq(actionCollaborators.actionId, input.actionId))

    if (input.userIds.length > 0) {
      await db.insert(actionCollaborators).values(
        input.userIds.map((userId) => ({
          id: uuidv7(),
          organizationId: actor.organizationId,
          actionId: input.actionId,
          userId,
        })),
      )
    }

    await recordActivity(db, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      verb: 'action.collaborators_changed',
      entityType: 'action',
      entityId: input.actionId,
      projectId: existing.projectId,
      clientId: existing.clientId,
      params: { name: existing.title },
    })

    await audit({
      action: 'action.collaborators_changed',
      entityType: 'action',
      entityId: input.actionId,
      after: { count: input.userIds.length },
    })

    return { actionId: input.actionId }
  },
})

/**
 * A comment.
 *
 * `visibility` defaults to 'internal' in the schema AND in the column. The two
 * guard against different mistakes — a field nobody filled in, and a row
 * inserted by something that never read the schema — and the cost of the
 * duplication is one line (rule 2).
 */
export const addComment = defineAction({
  input: addCommentSchema,
  permission: 'action.read',
  handler: async (input, { actor, db, audit }) => {
    const action = await requireVisibleAction(db, actor, input.actionId)
    const id = uuidv7()

    await db.insert(comments).values({
      id,
      organizationId: actor.organizationId,
      entityType: 'action',
      entityId: input.actionId,
      projectId: action.projectId,
      clientId: action.clientId,
      authorUserId: actor.userId,
      body: input.body,
      visibility: input.visibility,
    })

    if (input.mentionUserIds.length > 0) {
      await db.insert(commentMentions).values(
        input.mentionUserIds.map((userId) => ({
          organizationId: actor.organizationId,
          commentId: id,
          userId,
        })),
      )
    }

    await recordActivity(db, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      verb: 'action.commented',
      entityType: 'action',
      entityId: input.actionId,
      projectId: action.projectId,
      clientId: action.clientId,
      params: { name: action.title },
      // An internal comment leaves no trace on a shared feed.
      visibility: input.visibility,
    })

    await audit({
      action: 'action.commented',
      entityType: 'action',
      entityId: input.actionId,
      after: { visibility: input.visibility, mentions: input.mentionUserIds.length },
    })

    return { id }
  },
})

export const deleteComment = defineAction({
  input: deleteCommentSchema,
  permission: 'action.read',
  handler: async (input, { actor, db, audit }) => {
    const [existing] = await db
      .select({ id: comments.id, authorUserId: comments.authorUserId })
      .from(comments)
      .where(and(eq(comments.id, input.id), isNull(comments.deletedAt)))
      .limit(1)

    if (!existing) throw new AppError('not_found', 'errors.not_found')

    // Your own words are yours to withdraw; everyone else's are not, whatever
    // the role — a manager deleting a colleague's comment rewrites a record.
    if (existing.authorUserId !== actor.userId) {
      throw new AppError('not_found', 'errors.not_found')
    }

    await db
      .update(comments)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(comments.id, input.id))

    await audit({ action: 'action.comment_deleted', entityType: 'comment', entityId: input.id })

    return { id: input.id }
  },
})

/**
 * A file hung on an action.
 *
 * The bytes go through the same door as every other upload: the type is read
 * from the file, not from its name (ADR-037), and the object is stored before
 * the row that points at it.
 */
export const attachToAction = defineAction({
  input: attachToActionSchema,
  permission: 'action.update_own',
  handler: async (input, { actor, db, audit }) => {
    const action = await requireEditableAction(db, actor, input.actionId)

    const bytes = new Uint8Array(await input.file.arrayBuffer())
    const verdict = inspectAttachment(bytes)
    if (!verdict.ok) throw new AppError('validation_failed', `errors.upload_${verdict.reason}`)

    const stored = await storeFile(db, {
      organizationId: actor.organizationId,
      uploadedBy: actor.userId,
      kind: 'attachment',
      filename: input.file.name,
      mimeType: verdict.mimeType,
      extension: extensionFor(verdict.mimeType),
      bytes,
    })

    await db.insert(attachments).values({
      id: uuidv7(),
      organizationId: actor.organizationId,
      fileId: stored.id,
      entityType: 'action',
      entityId: input.actionId,
      projectId: action.projectId,
      createdBy: actor.userId,
    })

    await audit({
      action: 'action.attachment_added',
      entityType: 'action',
      entityId: input.actionId,
      after: { fileId: stored.id, mimeType: verdict.mimeType },
    })

    return { fileId: stored.id }
  },
})

/**
 * ============================================================================
 * The denormalised project counters (ADR-013, R5).
 *
 * Recomputed by the mutation that invalidated them, IN THE SAME TRANSACTION,
 * from the rows themselves rather than by incrementing — an increment is right
 * until the first concurrent write, and then wrong forever.
 *
 * "Overdue" is counted in the PROJECT's timezone, by the same pure function the
 * screens use (ADR-039).
 * ============================================================================
 */
async function refreshProjectCounters(
  db: TenantDb,
  projectId: string,
  timezone: string,
): Promise<void> {
  const rows = await db
    .select({ status: actions.status, dueDate: actions.dueDate })
    .from(actions)
    .where(and(eq(actions.projectId, projectId), isNull(actions.deletedAt)))

  const counts = actionCounts(rows, timezone, new Date())

  const [milestones] = await db
    .select({
      total: sql<number>`(
        SELECT count(*)::int FROM milestones m
         WHERE m.project_id = ${projectId} AND m.deleted_at IS NULL
      )`,
      reached: sql<number>`(
        SELECT count(*)::int FROM milestones m
         WHERE m.project_id = ${projectId} AND m.deleted_at IS NULL AND m.reached_at IS NOT NULL
      )`,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)

  await db
    .update(projects)
    .set({
      ...counts,
      progressPercent: projectProgress({
        ...counts,
        milestonesTotal: milestones?.total ?? 0,
        milestonesReached: milestones?.reached ?? 0,
      }),
    })
    .where(eq(projects.id, projectId))
}

/** `done` stamps the moment; anything else clears it. */
function completedAtFor(status: ActionStatusValue, current: Date | null): Date | null {
  if (status !== 'done') return null
  return current ?? new Date()
}

function statusVerb(status: ActionStatusValue): string {
  if (status === 'done') return 'action.completed'
  if (status === 'blocked') return 'action.blocked'
  if (status === 'cancelled') return 'action.cancelled'
  return 'action.status_changed'
}

async function requireProject(db: TenantDb, projectId: string) {
  const [project] = await db
    .select({ id: projects.id, clientId: projects.clientId, timezone: projects.timezone })
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
    .limit(1)

  if (!project) throw new AppError('not_found', 'errors.not_found')
  return project
}

/** Readable by this actor — the project scope, one level down (ADR-038). */
async function requireVisibleAction(db: TenantDb, actor: Actor, id: string) {
  const scope = can(actor, 'project.read_all')
    ? undefined
    : sql`EXISTS (
        SELECT 1 FROM project_members pm
         WHERE pm.project_id = ${actions.projectId} AND pm.user_id = ${actor.userId}
      )`

  const [action] = await db
    .select({
      id: actions.id,
      title: actions.title,
      status: actions.status,
      projectId: actions.projectId,
      assigneeId: actions.assigneeId,
      createdBy: actions.createdBy,
      blockedReason: actions.blockedReason,
      completedAt: actions.completedAt,
      clientId: projects.clientId,
      timezone: projects.timezone,
    })
    .from(actions)
    .innerJoin(projects, eq(projects.id, actions.projectId))
    .where(and(eq(actions.id, id), isNull(actions.deletedAt), scope))
    .limit(1)

  if (!action) throw new AppError('not_found', 'errors.not_found')
  return action
}

/**
 * Visible AND this actor's to change.
 *
 * `action.update_own` without a row-level check is `action.update_any` with
 * extra steps — the matrix says a collaborator may edit actions, the policy
 * says which ones (see policy.ts). 404 rather than 403: a refusal that confirms
 * the row exists is a disclosure.
 */
async function requireEditableAction(db: TenantDb, actor: Actor, id: string) {
  const action = await requireVisibleAction(db, actor, id)

  const collaborators = await db
    .select({ userId: actionCollaborators.userId })
    .from(actionCollaborators)
    .where(eq(actionCollaborators.actionId, id))

  const allowed = mayEditAction(
    { userId: actor.userId, canUpdateAny: can(actor, 'action.update_any') },
    {
      assigneeId: action.assigneeId,
      createdBy: action.createdBy,
      collaboratorIds: collaborators.map((row) => row.userId),
    },
  )

  if (!allowed) throw new AppError('not_found', 'errors.not_found')
  return action
}
