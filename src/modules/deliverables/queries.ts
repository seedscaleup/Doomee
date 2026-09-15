import 'server-only'

import { and, asc, desc, eq, ilike, isNull, or, type SQL, sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  actions,
  clients,
  deliverableReviews,
  deliverables,
  deliverableTypes,
  deliverableVersions,
  files,
  memberships,
  projects,
  users,
} from '@/db/schema'
import type { TenantDb } from '@/db/tenant'
import { type Actor, can } from '@/lib/permissions'
import { MAX_SIGNED_URL_TTL_SECONDS, storage } from '@/lib/storage'
import { defineQuery } from '@/server'
import { listDeliverablesSchema } from './schemas'
import type {
  DeliverableDetail,
  DeliverableRow,
  PersonOption,
  ProjectOption,
  ReviewRow,
  TaxonomyOption,
  VersionRow,
} from './types'

/**
 * The collaborator scope, one level down again (ADR-038).
 *
 * A deliverable is readable when its PROJECT is. Writing it as a clause on the
 * project rather than re-deriving it keeps one rule in the product: change who
 * may see a project and every deliverable list follows.
 */
function withinVisibleProjects(actor: Actor): SQL | undefined {
  if (can(actor, 'project.read_all')) return undefined

  return sql`EXISTS (
    SELECT 1 FROM project_members pm
     WHERE pm.project_id = ${deliverables.projectId}
       AND pm.user_id = ${actor.userId}
  )`
}

const DELIVERABLE_COLUMNS = {
  id: deliverables.id,
  title: deliverables.title,
  status: deliverables.status,
  projectId: deliverables.projectId,
  projectName: projects.name,
  clientName: clients.name,
  typeLabels: deliverableTypes.labels,
  ownerName: users.name,
  dueDate: deliverables.dueDate,
  isClientVisible: deliverables.isClientVisible,
  versionCount: sql<number>`(
    SELECT count(*)::int FROM deliverable_versions dv
     WHERE dv.deliverable_id = ${deliverables.id}
  )`,
  currentVersion: sql<number | null>`(
    SELECT dv.version FROM deliverable_versions dv
     WHERE dv.id = ${deliverables.currentVersionId}
  )`,
}

export const listDeliverables = defineQuery({
  input: listDeliverablesSchema,
  permission: 'deliverable.read',
  handler: async (input, { actor, db }): Promise<DeliverableRow[]> => {
    const filters: (SQL | undefined)[] = [
      isNull(deliverables.deletedAt),
      withinVisibleProjects(actor),
    ]

    if (input.projectId) filters.push(eq(deliverables.projectId, input.projectId))
    if (input.clientId) filters.push(eq(projects.clientId, input.clientId))
    if (input.status) filters.push(eq(deliverables.status, input.status))
    if (!input.includePublished) filters.push(sql`${deliverables.status} <> 'published'`)

    if (input.search) {
      const needle = `%${input.search}%`
      const match = or(
        sql`unaccent(${deliverables.title}) ILIKE unaccent(${needle})`,
        ilike(deliverables.description, needle),
      )
      if (match) filters.push(match)
    }

    return db
      .select(DELIVERABLE_COLUMNS)
      .from(deliverables)
      .innerJoin(projects, eq(projects.id, deliverables.projectId))
      .leftJoin(clients, eq(clients.id, projects.clientId))
      .leftJoin(deliverableTypes, eq(deliverableTypes.id, deliverables.deliverableTypeId))
      .leftJoin(users, eq(users.id, deliverables.ownerUserId))
      .where(and(...filters))
      .orderBy(sql`${deliverables.dueDate} ASC NULLS LAST`, asc(deliverables.title))
      .limit(input.limit)
  },
})

export const getDeliverable = defineQuery({
  input: z.object({ id: z.uuid() }),
  permission: 'deliverable.read',
  handler: async (input, { actor, db }): Promise<DeliverableDetail | null> => {
    const rows = await db
      .select({
        ...DELIVERABLE_COLUMNS,
        description: deliverables.description,
        actionId: deliverables.actionId,
        actionTitle: actions.title,
        deliverableTypeId: deliverables.deliverableTypeId,
        ownerUserId: deliverables.ownerUserId,
        externalUrl: deliverables.externalUrl,
        timezone: projects.timezone,
        sentToClientAt: sql<
          string | null
        >`to_char(${deliverables.sentToClientAt}, 'YYYY-MM-DD"T"HH24:MI:SSOF')`,
        approvedAt: sql<
          string | null
        >`to_char(${deliverables.approvedAt}, 'YYYY-MM-DD"T"HH24:MI:SSOF')`,
        publishedAt: sql<
          string | null
        >`to_char(${deliverables.publishedAt}, 'YYYY-MM-DD"T"HH24:MI:SSOF')`,
      })
      .from(deliverables)
      .innerJoin(projects, eq(projects.id, deliverables.projectId))
      .leftJoin(clients, eq(clients.id, projects.clientId))
      .leftJoin(deliverableTypes, eq(deliverableTypes.id, deliverables.deliverableTypeId))
      .leftJoin(users, eq(users.id, deliverables.ownerUserId))
      .leftJoin(actions, eq(actions.id, deliverables.actionId))
      .where(
        and(
          eq(deliverables.id, input.id),
          isNull(deliverables.deletedAt),
          withinVisibleProjects(actor),
        ),
      )
      .limit(1)

    return rows[0] ?? null
  },
})

export const listVersions = defineQuery({
  input: z.object({ deliverableId: z.uuid() }),
  permission: 'deliverable.read',
  handler: async (input, { actor, db }): Promise<VersionRow[]> => {
    if (!(await deliverableIsVisible(db, actor, input.deliverableId))) return []

    const rows = await db
      .select({
        id: deliverableVersions.id,
        version: deliverableVersions.version,
        notes: deliverableVersions.notes,
        externalUrl: deliverableVersions.externalUrl,
        filename: files.filename,
        mimeType: files.mimeType,
        sizeBytes: files.sizeBytes,
        storageKey: files.storageKey,
        createdByName: users.name,
        createdAt: sql<string>`to_char(${deliverableVersions.createdAt}, 'YYYY-MM-DD"T"HH24:MI:SSOF')`,
      })
      .from(deliverableVersions)
      .leftJoin(files, eq(files.id, deliverableVersions.fileId))
      .leftJoin(users, eq(users.id, deliverableVersions.createdBy))
      .where(eq(deliverableVersions.deliverableId, input.deliverableId))
      .orderBy(desc(deliverableVersions.version))

    // The link is minted here, after the permission check and inside the tenant
    // transaction that proved the row is ours — and it expires (R13, ADR-037).
    return Promise.all(
      rows.map(async ({ storageKey, ...rest }) => ({
        ...rest,
        url: storageKey ? await storage().signedUrl(storageKey, MAX_SIGNED_URL_TTL_SECONDS) : null,
      })),
    )
  },
})

/**
 * The review history.
 *
 * Every decision, with the version it was about. "The client approved it" is
 * not an answer if nobody can say which version they approved.
 */
export const listReviews = defineQuery({
  input: z.object({ deliverableId: z.uuid() }),
  permission: 'deliverable.read',
  handler: async (input, { actor, db }): Promise<ReviewRow[]> => {
    if (!(await deliverableIsVisible(db, actor, input.deliverableId))) return []

    return db
      .select({
        id: deliverableReviews.id,
        scope: deliverableReviews.scope,
        decision: deliverableReviews.decision,
        comment: deliverableReviews.comment,
        version: deliverableVersions.version,
        reviewerName: users.name,
        createdAt: sql<string>`to_char(${deliverableReviews.createdAt}, 'YYYY-MM-DD"T"HH24:MI:SSOF')`,
      })
      .from(deliverableReviews)
      .innerJoin(deliverableVersions, eq(deliverableVersions.id, deliverableReviews.versionId))
      .leftJoin(users, eq(users.id, deliverableReviews.reviewerUserId))
      .where(eq(deliverableReviews.deliverableId, input.deliverableId))
      .orderBy(desc(deliverableReviews.createdAt))
      .limit(100)
  },
})

export const listDeliverableTypes = defineQuery({
  permission: 'deliverable.read',
  handler: async (_input: undefined, { db }): Promise<TaxonomyOption[]> => {
    return db
      .select({
        id: deliverableTypes.id,
        code: deliverableTypes.code,
        labels: deliverableTypes.labels,
      })
      .from(deliverableTypes)
      .where(eq(deliverableTypes.isActive, true))
      .orderBy(asc(deliverableTypes.sortOrder))
  },
})

/** Which projects a deliverable may be created in — the same scope as everywhere. */
export const listProjectOptions = defineQuery({
  permission: 'deliverable.read',
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

/** Who can own a deliverable. A client contact never owns internal work. */
export const listOwnerOptions = defineQuery({
  permission: 'deliverable.read',
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
 * One visibility check, reused by everything hanging off a deliverable.
 *
 * Without it, "what did the client say about this?" would answer for
 * deliverables the reader cannot see.
 */
async function deliverableIsVisible(
  db: TenantDb,
  actor: Actor,
  deliverableId: string,
): Promise<boolean> {
  const [found] = await db
    .select({ id: deliverables.id })
    .from(deliverables)
    .where(
      and(
        eq(deliverables.id, deliverableId),
        isNull(deliverables.deletedAt),
        withinVisibleProjects(actor),
      ),
    )
    .limit(1)

  return Boolean(found)
}
