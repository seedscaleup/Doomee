import 'server-only'

import { and, asc, desc, eq, ilike, inArray, isNull, or, type SQL, sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  actionCategories,
  actionCollaborators,
  actions,
  actionTypes,
  attachments,
  channels,
  commentMentions,
  comments,
  files,
  memberships,
  projects,
  users,
} from '@/db/schema'
import type { TenantDb } from '@/db/tenant'
import { type Actor, can } from '@/lib/permissions'
import { MAX_SIGNED_URL_TTL_SECONDS, storage } from '@/lib/storage'
import { defineQuery } from '@/server'
import { listActionsSchema } from './schemas'
import type {
  ActionRow,
  AttachmentRow,
  CommentRow,
  PersonOption,
  ProjectOption,
  TaxonomyOption,
} from './types'

/**
 * The collaborator scope again, one level down.
 *
 * An action is readable when its PROJECT is (ADR-038). Writing it as a clause
 * on the project rather than re-deriving it here keeps one rule in the product:
 * change who may see a project and every action list follows.
 */
function withinVisibleProjects(actor: Actor): SQL | undefined {
  if (can(actor, 'project.read_all')) return undefined

  return sql`EXISTS (
    SELECT 1 FROM project_members pm
     WHERE pm.project_id = ${actions.projectId}
       AND pm.user_id = ${actor.userId}
  )`
}

const ACTION_COLUMNS = {
  id: actions.id,
  title: actions.title,
  status: actions.status,
  priority: actions.priority,
  dueDate: actions.dueDate,
  projectId: actions.projectId,
  projectName: projects.name,
  timezone: projects.timezone,
  assigneeId: actions.assigneeId,
  assigneeName: users.name,
  isClientVisible: actions.isClientVisible,
  collaboratorCount: sql<number>`(
    SELECT count(*)::int FROM action_collaborators ac WHERE ac.action_id = ${actions.id}
  )`,
}

export const listActions = defineQuery({
  input: listActionsSchema,
  permission: 'action.read',
  handler: async (input, { actor, db }): Promise<ActionRow[]> => {
    const filters: (SQL | undefined)[] = [isNull(actions.deletedAt), withinVisibleProjects(actor)]

    if (input.projectId) filters.push(eq(actions.projectId, input.projectId))
    if (input.assigneeId) filters.push(eq(actions.assigneeId, input.assigneeId))
    if (input.status) filters.push(eq(actions.status, input.status))
    if (!input.includeClosed) filters.push(sql`${actions.status} NOT IN ('done', 'cancelled')`)

    if (input.search) {
      const needle = `%${input.search}%`
      const match = or(
        sql`unaccent(${actions.title}) ILIKE unaccent(${needle})`,
        ilike(actions.description, needle),
      )
      if (match) filters.push(match)
    }

    return (
      db
        .select(ACTION_COLUMNS)
        .from(actions)
        .innerJoin(projects, eq(projects.id, actions.projectId))
        .leftJoin(users, eq(users.id, actions.assigneeId))
        .where(and(...filters))
        // The urgency order is applied in the pure service, which knows about
        // timezones; this only keeps the page deterministic.
        .orderBy(sql`${actions.dueDate} ASC NULLS LAST`, asc(actions.title))
        .limit(input.limit)
    )
  },
})

/**
 * My Work and Focus Mode read the same rows: everything open and assigned to
 * me, across every project I can see. The cutting into buckets happens in the
 * pure service, so both screens answer "what is urgent" identically.
 */
export const listMyActions = defineQuery({
  permission: 'action.read',
  handler: async (_input: undefined, { actor, db }): Promise<ActionRow[]> => {
    return db
      .select(ACTION_COLUMNS)
      .from(actions)
      .innerJoin(projects, eq(projects.id, actions.projectId))
      .leftJoin(users, eq(users.id, actions.assigneeId))
      .where(
        and(
          isNull(actions.deletedAt),
          eq(actions.assigneeId, actor.userId),
          sql`${actions.status} NOT IN ('done', 'cancelled')`,
          withinVisibleProjects(actor),
        ),
      )
      .orderBy(sql`${actions.dueDate} ASC NULLS LAST`, asc(actions.title))
      .limit(200)
  },
})

export const getAction = defineQuery({
  input: z.object({ id: z.uuid() }),
  permission: 'action.read',
  handler: async (input, { actor, db }) => {
    const rows = await db
      .select({
        ...ACTION_COLUMNS,
        description: actions.description,
        startDate: actions.startDate,
        actionTypeId: actions.actionTypeId,
        categoryId: actions.categoryId,
        channelId: actions.channelId,
        estimatedMinutes: actions.estimatedMinutes,
        spentMinutes: actions.spentMinutes,
        blockedReason: actions.blockedReason,
        completedAt: sql<
          string | null
        >`to_char(${actions.completedAt}, 'YYYY-MM-DD"T"HH24:MI:SSOF')`,
      })
      .from(actions)
      .innerJoin(projects, eq(projects.id, actions.projectId))
      .leftJoin(users, eq(users.id, actions.assigneeId))
      .where(and(eq(actions.id, input.id), isNull(actions.deletedAt), withinVisibleProjects(actor)))
      .limit(1)

    return rows[0] ?? null
  },
})

export const listActionCollaborators = defineQuery({
  input: z.object({ actionId: z.uuid() }),
  permission: 'action.read',
  handler: async (input, { actor, db }): Promise<PersonOption[]> => {
    if (!(await actionIsVisible(db, actor, input.actionId))) return []

    return db
      .select({ userId: actionCollaborators.userId, name: users.name })
      .from(actionCollaborators)
      .innerJoin(users, eq(users.id, actionCollaborators.userId))
      .where(eq(actionCollaborators.actionId, input.actionId))
      .orderBy(asc(users.name))
  },
})

export const listComments = defineQuery({
  input: z.object({ actionId: z.uuid() }),
  permission: 'action.read',
  handler: async (input, { actor, db }): Promise<CommentRow[]> => {
    if (!(await actionIsVisible(db, actor, input.actionId))) return []

    const rows = await db
      .select({
        id: comments.id,
        body: comments.body,
        visibility: comments.visibility,
        authorName: users.name,
        createdAt: sql<string>`to_char(${comments.createdAt}, 'YYYY-MM-DD"T"HH24:MI:SSOF')`,
      })
      .from(comments)
      .leftJoin(users, eq(users.id, comments.authorUserId))
      .where(
        and(
          eq(comments.entityType, 'action'),
          eq(comments.entityId, input.actionId),
          isNull(comments.deletedAt),
        ),
      )
      .orderBy(desc(comments.createdAt))
      .limit(100)

    if (rows.length === 0) return []

    const mentioned = await db
      .select({ commentId: commentMentions.commentId, name: users.name })
      .from(commentMentions)
      .innerJoin(users, eq(users.id, commentMentions.userId))
      .where(
        inArray(
          commentMentions.commentId,
          rows.map((row) => row.id),
        ),
      )

    return rows.map((row) => ({
      ...row,
      mentions: mentioned.filter((m) => m.commentId === row.id).map((m) => m.name),
    }))
  },
})

export const listAttachments = defineQuery({
  input: z.object({ actionId: z.uuid() }),
  permission: 'action.read',
  handler: async (input, { actor, db }): Promise<AttachmentRow[]> => {
    if (!(await actionIsVisible(db, actor, input.actionId))) return []

    const rows = await db
      .select({
        id: attachments.id,
        filename: files.filename,
        mimeType: files.mimeType,
        sizeBytes: files.sizeBytes,
        storageKey: files.storageKey,
      })
      .from(attachments)
      .innerJoin(files, eq(files.id, attachments.fileId))
      .where(
        and(
          eq(attachments.entityType, 'action'),
          eq(attachments.entityId, input.actionId),
          isNull(files.deletedAt),
        ),
      )
      .orderBy(desc(attachments.createdAt))

    // The link is minted here, after the permission check and inside the tenant
    // transaction that proved the row is ours — and it expires (R13, ADR-037).
    return Promise.all(
      rows.map(async ({ storageKey, ...rest }) => ({
        ...rest,
        url: await storage().signedUrl(storageKey, MAX_SIGNED_URL_TTL_SECONDS),
      })),
    )
  },
})

/** The three taxonomies an action is classified by, system rows included. */
export const listActionTaxonomies = defineQuery({
  permission: 'action.read',
  handler: async (
    _input: undefined,
    { db },
  ): Promise<{
    types: TaxonomyOption[]
    categories: TaxonomyOption[]
    channels: TaxonomyOption[]
  }> => {
    /**
     * Sequential, not Promise.all: every query in a handler runs on the SAME
     * connection inside one transaction, and pg refuses to interleave two
     * queries on one client. Parallelism here buys a millisecond and costs
     * correctness.
     */
    const types = await db
      .select({ id: actionTypes.id, code: actionTypes.code, labels: actionTypes.labels })
      .from(actionTypes)
      .where(eq(actionTypes.isActive, true))
      .orderBy(asc(actionTypes.sortOrder))

    const categories = await db
      .select({
        id: actionCategories.id,
        code: actionCategories.code,
        labels: actionCategories.labels,
      })
      .from(actionCategories)
      .where(eq(actionCategories.isActive, true))
      .orderBy(asc(actionCategories.sortOrder))

    const channelRows = await db
      .select({ id: channels.id, code: channels.code, labels: channels.labels })
      .from(channels)
      .where(eq(channels.isActive, true))
      .orderBy(asc(channels.sortOrder))

    return { types, categories, channels: channelRows }
  },
})

/** Which projects an action may be created in — the same scope as everywhere. */
export const listProjectOptions = defineQuery({
  permission: 'action.read',
  handler: async (_input: undefined, { actor, db }): Promise<ProjectOption[]> => {
    const scope = can(actor, 'project.read_all')
      ? undefined
      : sql`EXISTS (
          SELECT 1 FROM project_members pm
           WHERE pm.project_id = ${projects.id} AND pm.user_id = ${actor.userId}
        )`

    return db
      .select({ id: projects.id, name: projects.name, timezone: projects.timezone })
      .from(projects)
      .where(and(isNull(projects.deletedAt), sql`${projects.status} <> 'archived'`, scope))
      .orderBy(asc(projects.name))
      .limit(500)
  },
})

/** Who can be assigned or mentioned. A client contact is never either. */
export const listAssignableUsers = defineQuery({
  permission: 'action.read',
  handler: async (_input: undefined, { db }): Promise<PersonOption[]> => {
    return db
      .select({ userId: users.id, name: users.name })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.status, 'active'), sql`${memberships.role} <> 'client'`))
      .orderBy(asc(users.name))
      .limit(500)
  },
})

/**
 * One visibility check, reused by everything hanging off an action.
 *
 * Without it, "who commented on this?" would answer for actions the reader
 * cannot see — the list would be empty of actions and full of their comments.
 */
async function actionIsVisible(db: TenantDb, actor: Actor, actionId: string): Promise<boolean> {
  const [found] = await db
    .select({ id: actions.id })
    .from(actions)
    .where(and(eq(actions.id, actionId), isNull(actions.deletedAt), withinVisibleProjects(actor)))
    .limit(1)

  return Boolean(found)
}
