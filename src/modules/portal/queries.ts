import 'server-only'

import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { isoInstant, isoInstantOrNull } from '@/db/columns'
import {
  portalActivityEvents,
  portalClients,
  portalComments,
  portalDeliverableReviews,
  portalDeliverables,
  portalDeliverableTypes,
  portalDeliverableVersions,
  portalFiles,
  portalMetrics,
  portalObjectives,
  portalProjects,
  portalReportSections,
  portalReports,
  portalResultMetrics,
  portalResults,
  portalUsers,
} from '@/db/portal-schema'
import type { TenantDb } from '@/db/tenant'
import { MAX_SIGNED_URL_TTL_SECONDS, storage } from '@/lib/storage'
import { definePortalQuery } from '@/server'
import type {
  PortalClient,
  PortalCommentRow,
  PortalDeliverableRow,
  PortalEventRow,
  PortalMetricRow,
  PortalObjectiveRow,
  PortalProjectRow,
  PortalReportDetail,
  PortalReportRow,
  PortalResultRow,
  PortalReviewRow,
} from './types'

/**
 * ============================================================================
 * Everything the portal reads, and it reads ONLY the portal.* views.
 *
 * There is no client-scope clause anywhere in this file, and that is the
 * point: `withPortal` pins `app.client_ids` inside the transaction and the
 * policies do the filtering. A clause here would be a fourth place to get it
 * right, and the one most likely to be forgotten.
 * ============================================================================
 */

export const listMyClients = definePortalQuery({
  permission: 'client.read',
  handler: async (_input: undefined, { db }): Promise<PortalClient[]> => {
    return db
      .select({ id: portalClients.id, name: portalClients.name, slug: portalClients.slug })
      .from(portalClients)
      .orderBy(portalClients.name)
  },
})

export const listPortalProjects = definePortalQuery({
  permission: 'project.read',
  handler: async (_input: undefined, { db }): Promise<PortalProjectRow[]> => {
    return db
      .select({
        id: portalProjects.id,
        name: portalProjects.name,
        description: portalProjects.description,
        status: portalProjects.status,
        clientId: portalProjects.clientId,
        clientName: portalClients.name,
        startDate: portalProjects.startDate,
        endDate: portalProjects.endDate,
        timezone: portalProjects.timezone,
        progressPercent: portalProjects.progressPercent,
        // The portal's call to action, counted where the rows already are.
        awaitingDecision: sql<number>`(
          SELECT count(*)::int FROM portal.deliverables d
           WHERE d.project_id = ${portalProjects.id} AND d.status = 'client_review'
        )`,
      })
      .from(portalProjects)
      .leftJoin(portalClients, eq(portalClients.id, portalProjects.clientId))
      .orderBy(portalProjects.name)
  },
})

export const getPortalProject = definePortalQuery({
  input: z.object({ id: z.uuid() }),
  handler: async (input, { db }): Promise<PortalProjectRow | null> => {
    const rows = await db
      .select({
        id: portalProjects.id,
        name: portalProjects.name,
        description: portalProjects.description,
        status: portalProjects.status,
        clientId: portalProjects.clientId,
        clientName: portalClients.name,
        startDate: portalProjects.startDate,
        endDate: portalProjects.endDate,
        timezone: portalProjects.timezone,
        progressPercent: portalProjects.progressPercent,
        awaitingDecision: sql<number>`(
          SELECT count(*)::int FROM portal.deliverables d
           WHERE d.project_id = ${portalProjects.id} AND d.status = 'client_review'
        )`,
      })
      .from(portalProjects)
      .leftJoin(portalClients, eq(portalClients.id, portalProjects.clientId))
      .where(eq(portalProjects.id, input.id))
      .limit(1)

    return rows[0] ?? null
  },
  permission: 'project.read',
})

const DELIVERABLE_COLUMNS = {
  id: portalDeliverables.id,
  projectId: portalDeliverables.projectId,
  projectName: portalProjects.name,
  title: portalDeliverables.title,
  description: portalDeliverables.description,
  status: portalDeliverables.status,
  typeLabels: portalDeliverableTypes.labels,
  dueDate: portalDeliverables.dueDate,
  sentToClientAt: isoInstantOrNull(portalDeliverables.sentToClientAt),
  version: portalDeliverableVersions.version,
  versionId: portalDeliverableVersions.id,
  externalUrl: portalDeliverableVersions.externalUrl,
  fileName: portalFiles.filename,
  fileId: portalDeliverableVersions.fileId,
}

export const listPortalDeliverables = definePortalQuery({
  input: z.object({ projectId: z.uuid().optional() }).default({}),
  permission: 'deliverable.read',
  handler: async (input, { actor, db }): Promise<PortalDeliverableRow[]> => {
    const rows = await db
      .select(DELIVERABLE_COLUMNS)
      .from(portalDeliverables)
      .innerJoin(portalProjects, eq(portalProjects.id, portalDeliverables.projectId))
      .leftJoin(
        portalDeliverableTypes,
        eq(portalDeliverableTypes.id, portalDeliverables.deliverableTypeId),
      )
      // The CURRENT version, not every version: the portal asks "what am I
      // looking at", and the history is a separate screen.
      .leftJoin(
        portalDeliverableVersions,
        eq(portalDeliverableVersions.id, portalDeliverables.currentVersionId),
      )
      .leftJoin(portalFiles, eq(portalFiles.id, portalDeliverableVersions.fileId))
      .where(input.projectId ? eq(portalDeliverables.projectId, input.projectId) : undefined)
      .orderBy(desc(portalDeliverables.sentToClientAt))

    return withSignedLinks(db, actor.organizationId, rows)
  },
})

export const getPortalDeliverable = definePortalQuery({
  input: z.object({ id: z.uuid() }),
  permission: 'deliverable.read',
  handler: async (input, { actor, db }): Promise<PortalDeliverableRow | null> => {
    const rows = await db
      .select(DELIVERABLE_COLUMNS)
      .from(portalDeliverables)
      .innerJoin(portalProjects, eq(portalProjects.id, portalDeliverables.projectId))
      .leftJoin(
        portalDeliverableTypes,
        eq(portalDeliverableTypes.id, portalDeliverables.deliverableTypeId),
      )
      .leftJoin(
        portalDeliverableVersions,
        eq(portalDeliverableVersions.id, portalDeliverables.currentVersionId),
      )
      .leftJoin(portalFiles, eq(portalFiles.id, portalDeliverableVersions.fileId))
      .where(eq(portalDeliverables.id, input.id))
      .limit(1)

    const [row] = await withSignedLinks(db, actor.organizationId, rows)
    return row ?? null
  },
})

export const listPortalReviews = definePortalQuery({
  input: z.object({ deliverableId: z.uuid() }),
  permission: 'deliverable.read',
  handler: async (input, { db }): Promise<PortalReviewRow[]> => {
    return db
      .select({
        id: portalDeliverableReviews.id,
        scope: portalDeliverableReviews.scope,
        decision: portalDeliverableReviews.decision,
        // NULL for an internal review: the view blanks it (ADR-026).
        comment: portalDeliverableReviews.comment,
        version: portalDeliverableVersions.version,
        createdAt: isoInstant(portalDeliverableReviews.createdAt),
      })
      .from(portalDeliverableReviews)
      .innerJoin(
        portalDeliverableVersions,
        eq(portalDeliverableVersions.id, portalDeliverableReviews.versionId),
      )
      .where(eq(portalDeliverableReviews.deliverableId, input.deliverableId))
      .orderBy(desc(portalDeliverableReviews.createdAt))
  },
})

/**
 * Results with their numbers.
 *
 * Two queries, sequential: one transaction runs one query at a time (ADR-044).
 */
export const listPortalResults = definePortalQuery({
  input: z.object({ projectId: z.uuid().optional() }).default({}),
  permission: 'result.read',
  handler: async (input, { db }): Promise<PortalResultRow[]> => {
    const rows = await db
      .select({
        id: portalResults.id,
        projectId: portalResults.projectId,
        projectName: portalProjects.name,
        title: portalResults.title,
        recordedFor: portalResults.recordedFor,
        analysis: portalResults.analysis,
        recommendation: portalResults.recommendation,
      })
      .from(portalResults)
      .innerJoin(portalProjects, eq(portalProjects.id, portalResults.projectId))
      .where(input.projectId ? eq(portalResults.projectId, input.projectId) : undefined)
      .orderBy(desc(portalResults.recordedFor))
      .limit(100)

    if (rows.length === 0) return []

    const metrics = await db
      .select({
        resultId: portalResultMetrics.resultId,
        metricId: portalResultMetrics.metricId,
        labels: portalMetrics.labels,
        value: portalResultMetrics.value,
        unit: portalResultMetrics.unit,
        currency: portalResultMetrics.currency,
        decimals: portalMetrics.decimals,
      })
      .from(portalResultMetrics)
      .innerJoin(portalMetrics, eq(portalMetrics.id, portalResultMetrics.metricId))
      .where(
        inArray(
          portalResultMetrics.resultId,
          rows.map((row) => row.id),
        ),
      )

    return rows.map((row) => ({
      ...row,
      metrics: metrics
        .filter((metric) => metric.resultId === row.id)
        .map(({ resultId: _resultId, ...metric }): PortalMetricRow => metric),
    }))
  },
})

export const listPortalObjectives = definePortalQuery({
  input: z.object({ projectId: z.uuid().optional() }).default({}),
  permission: 'objective.read',
  handler: async (input, { db }): Promise<PortalObjectiveRow[]> => {
    return db
      .select({
        id: portalObjectives.id,
        projectId: portalObjectives.projectId,
        title: portalObjectives.title,
        metricLabels: portalMetrics.labels,
        targetValue: portalObjectives.targetValue,
        currentValue: portalObjectives.currentValue,
        currency: portalObjectives.currency,
        status: portalObjectives.status,
        periodStart: portalObjectives.periodStart,
        periodEnd: portalObjectives.periodEnd,
        decimals: sql<number>`coalesce(${portalMetrics.decimals}, 0)`,
      })
      .from(portalObjectives)
      .leftJoin(portalMetrics, eq(portalMetrics.id, portalObjectives.metricId))
      .where(input.projectId ? eq(portalObjectives.projectId, input.projectId) : undefined)
      .orderBy(portalObjectives.title)
  },
})

export const listPortalComments = definePortalQuery({
  input: z.object({ entityType: z.enum(['project', 'deliverable']), entityId: z.uuid() }),
  permission: 'comment.create_shared',
  handler: async (input, { db }): Promise<PortalCommentRow[]> => {
    return db
      .select({
        id: portalComments.id,
        body: portalComments.body,
        authorName: portalUsers.name,
        createdAt: isoInstant(portalComments.createdAt),
        projectId: portalComments.projectId,
      })
      .from(portalComments)
      .leftJoin(portalUsers, eq(portalUsers.id, portalComments.authorUserId))
      .where(
        and(
          eq(portalComments.entityType, input.entityType),
          eq(portalComments.entityId, input.entityId),
        ),
      )
      .orderBy(desc(portalComments.createdAt))
      .limit(100)
  },
})

export const listPortalActivity = definePortalQuery({
  // No outer `.default({})`: the inner default already fills `limit`, and Zod
  // then wants the FULL output shape as the object default. Callers pass `{}`,
  // exactly as they do for listActions.
  input: z.object({
    projectId: z.uuid().optional(),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  permission: 'project.read',
  handler: async (input, { db }): Promise<PortalEventRow[]> => {
    return db
      .select({
        id: portalActivityEvents.id,
        verb: portalActivityEvents.verb,
        actorName: portalUsers.name,
        params: portalActivityEvents.params,
        createdAt: isoInstant(portalActivityEvents.createdAt),
      })
      .from(portalActivityEvents)
      .leftJoin(portalUsers, eq(portalUsers.id, portalActivityEvents.actorUserId))
      .where(input.projectId ? eq(portalActivityEvents.projectId, input.projectId) : undefined)
      .orderBy(desc(portalActivityEvents.createdAt))
      .limit(input.limit)
  },
})

/**
 * The signed link is minted HERE — after the policies proved the row is theirs,
 * inside the portal transaction, and it expires (R13, ADR-037).
 *
 * `portal.files` does not expose `storage_key`, so the key cannot reach a
 * browser through a view. The SERVER still needs it to build the link, and it
 * asks for it through `portal_file_key`, a definer function that answers only
 * for files the portal may already see. The key lives for the length of this
 * function and goes into `signedUrl`, nowhere else.
 */
async function withSignedLinks(
  db: TenantDb,
  organizationId: string,
  rows: readonly (Omit<PortalDeliverableRow, 'fileUrl'> & { fileId: string | null })[],
): Promise<PortalDeliverableRow[]> {
  const links = new Map<string, string | null>()

  // Sequential, not Promise.all: one transaction, one query at a time
  // (ADR-044).
  for (const row of rows) {
    if (!row.fileId || links.has(row.fileId)) continue
    const result = await db.execute(
      sql`SELECT portal_file_key(${organizationId}::uuid, ${row.fileId}::uuid) AS key`,
    )
    const key = (result.rows[0] as { key: string | null } | undefined)?.key ?? null
    links.set(row.fileId, key ? await storage().signedUrl(key, MAX_SIGNED_URL_TTL_SECONDS) : null)
  }

  return rows.map(({ fileId, ...rest }) => ({
    ...rest,
    fileUrl: fileId ? (links.get(fileId) ?? null) : null,
  }))
}

/**
 * ============================================================================
 * THE REPORTS TAB — the one the LOT 9 shell left empty.
 *
 * No status filter, no visibility filter, no client filter here: the policy on
 * `reports` already answers "published, and belonging to a project or client
 * this contact may see", and the policy on `report_sections` already answers
 * "included, client-visible, and not `attention_points`". Repeating either
 * condition in TypeScript would be a second place to get it right (ADR-026).
 * ============================================================================
 */
export const listPortalReports = definePortalQuery({
  input: z.object({ projectId: z.uuid().optional() }).default({}),
  permission: 'report.read',
  handler: async (input, { db }): Promise<PortalReportRow[]> => {
    return db
      .select({
        id: portalReports.id,
        type: portalReports.type,
        title: portalReports.title,
        projectId: portalReports.projectId,
        projectName: portalProjects.name,
        periodStart: portalReports.periodStart,
        periodEnd: portalReports.periodEnd,
        locale: portalReports.locale,
        publishedAt: sql<string | null>`to_char(${portalReports.publishedAt}, 'YYYY-MM-DD')`,
      })
      .from(portalReports)
      .leftJoin(portalProjects, eq(portalProjects.id, portalReports.projectId))
      .where(input.projectId ? eq(portalReports.projectId, input.projectId) : undefined)
      .orderBy(desc(portalReports.periodEnd))
      .limit(100)
  },
})

export const getPortalReport = definePortalQuery({
  input: z.object({ id: z.uuid() }),
  permission: 'report.read',
  handler: async (input, { db }): Promise<PortalReportDetail | null> => {
    const rows = await db
      .select({
        id: portalReports.id,
        type: portalReports.type,
        title: portalReports.title,
        projectId: portalReports.projectId,
        projectName: portalProjects.name,
        periodStart: portalReports.periodStart,
        periodEnd: portalReports.periodEnd,
        locale: portalReports.locale,
        publishedAt: sql<string | null>`to_char(${portalReports.publishedAt}, 'YYYY-MM-DD')`,
      })
      .from(portalReports)
      .leftJoin(portalProjects, eq(portalProjects.id, portalReports.projectId))
      .where(eq(portalReports.id, input.id))
      .limit(1)

    const report = rows[0]
    // 404, never 403: a client must not learn that a report exists (rule 6).
    if (!report) return null

    const sections = await db
      .select({
        id: portalReportSections.id,
        key: portalReportSections.key,
        sortOrder: portalReportSections.sortOrder,
        titleOverride: portalReportSections.titleOverride,
        body: portalReportSections.body,
        data: portalReportSections.data,
      })
      .from(portalReportSections)
      .where(eq(portalReportSections.reportId, input.id))
      .orderBy(portalReportSections.sortOrder)

    return { ...report, sections }
  },
})
