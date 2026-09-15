import 'server-only'

import { and, asc, desc, eq, isNull, type SQL, sql } from 'drizzle-orm'
import { z } from 'zod'
import { isoInstant, isoInstantOrNull } from '@/db/columns'
import { clients, projects, reportSections, reportShares, reports, users } from '@/db/schema'
import { type Actor, can } from '@/lib/permissions'
import { defineQuery } from '@/server'
import { listReportsSchema } from './schemas'
import type { ClientOption, ProjectOption, ReportRow, SectionRow, ShareRow } from './types'

/** The collaborator scope, once more (ADR-038). An org-wide report has no project. */
function withinVisibleProjects(actor: Actor): SQL | undefined {
  if (can(actor, 'project.read_all')) return undefined

  return sql`(
    ${reports.projectId} IS NULL
    OR EXISTS (
      SELECT 1 FROM project_members pm
       WHERE pm.project_id = ${reports.projectId} AND pm.user_id = ${actor.userId}
    )
  )`
}

const REPORT_COLUMNS = {
  id: reports.id,
  type: reports.type,
  title: reports.title,
  projectId: reports.projectId,
  projectName: projects.name,
  clientId: reports.clientId,
  clientName: clients.name,
  periodStart: reports.periodStart,
  periodEnd: reports.periodEnd,
  locale: reports.locale,
  status: reports.status,
  publishedAt: isoInstantOrNull(reports.publishedAt),
  authorName: users.name,
  sectionCount: sql<number>`(
    SELECT count(*)::int FROM report_sections s
     WHERE s.report_id = ${reports.id} AND s.is_included
  )`,
  shareCount: sql<number>`(
    SELECT count(*)::int FROM report_shares sh
     WHERE sh.report_id = ${reports.id} AND sh.revoked_at IS NULL AND sh.expires_at > now()
  )`,
}

export const listReports = defineQuery({
  input: listReportsSchema,
  permission: 'report.read',
  handler: async (input, { actor, db }): Promise<ReportRow[]> => {
    const filters: (SQL | undefined)[] = [isNull(reports.deletedAt), withinVisibleProjects(actor)]

    if (input.projectId) filters.push(eq(reports.projectId, input.projectId))
    if (input.clientId) filters.push(eq(reports.clientId, input.clientId))
    if (input.status) filters.push(eq(reports.status, input.status))

    return db
      .select(REPORT_COLUMNS)
      .from(reports)
      .leftJoin(projects, eq(projects.id, reports.projectId))
      .leftJoin(clients, eq(clients.id, reports.clientId))
      .leftJoin(users, eq(users.id, reports.createdBy))
      .where(and(...filters))
      .orderBy(desc(reports.periodEnd), desc(reports.createdAt))
      .limit(input.limit)
  },
})

export const getReport = defineQuery({
  input: z.object({ id: z.uuid() }),
  permission: 'report.read',
  handler: async (input, { actor, db }): Promise<ReportRow | null> => {
    const rows = await db
      .select(REPORT_COLUMNS)
      .from(reports)
      .leftJoin(projects, eq(projects.id, reports.projectId))
      .leftJoin(clients, eq(clients.id, reports.clientId))
      .leftJoin(users, eq(users.id, reports.createdBy))
      .where(and(eq(reports.id, input.id), isNull(reports.deletedAt), withinVisibleProjects(actor)))
      .limit(1)

    return rows[0] ?? null
  },
})

export const listSections = defineQuery({
  input: z.object({ reportId: z.uuid() }),
  permission: 'report.read',
  handler: async (input, { db }): Promise<SectionRow[]> => {
    return db
      .select({
        id: reportSections.id,
        key: reportSections.key,
        sortOrder: reportSections.sortOrder,
        isIncluded: reportSections.isIncluded,
        isClientVisible: reportSections.isClientVisible,
        titleOverride: reportSections.titleOverride,
        body: reportSections.body,
        data: reportSections.data,
        isEdited: reportSections.isEdited,
      })
      .from(reportSections)
      .where(eq(reportSections.reportId, input.reportId))
      .orderBy(asc(reportSections.sortOrder))
  },
})

/**
 * The share links of a report.
 *
 * `token_hash` is NOT selected, and there is no query anywhere that returns
 * it. The token is shown once, at creation, and never again — like an API key.
 */
export const listShares = defineQuery({
  input: z.object({ reportId: z.uuid() }),
  permission: 'report.publish',
  handler: async (input, { db }): Promise<ShareRow[]> => {
    return db
      .select({
        id: reportShares.id,
        expiresAt: isoInstant(reportShares.expiresAt),
        revokedAt: isoInstantOrNull(reportShares.revokedAt),
        hasPassword: sql<boolean>`${reportShares.passwordHash} IS NOT NULL`,
        viewCount: reportShares.viewCount,
        lastViewedAt: isoInstantOrNull(reportShares.lastViewedAt),
        recipientEmail: reportShares.recipientEmail,
      })
      .from(reportShares)
      .where(eq(reportShares.reportId, input.reportId))
      .orderBy(desc(reportShares.createdAt))
  },
})

export const listReportScopes = defineQuery({
  permission: 'report.create',
  handler: async (
    _input: undefined,
    { actor, db },
  ): Promise<{ projects: ProjectOption[]; clients: ClientOption[] }> => {
    const scope = can(actor, 'project.read_all')
      ? undefined
      : sql`EXISTS (
          SELECT 1 FROM project_members pm
           WHERE pm.project_id = ${projects.id} AND pm.user_id = ${actor.userId}
        )`

    // Sequential: one transaction, one query at a time (ADR-044).
    const projectRows = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(and(isNull(projects.deletedAt), sql`${projects.status} <> 'archived'`, scope))
      .orderBy(asc(projects.name))
      .limit(500)

    const clientRows = await db
      .selectDistinct({ id: clients.id, name: clients.name })
      .from(clients)
      .innerJoin(projects, eq(projects.clientId, clients.id))
      .where(and(isNull(clients.deletedAt), isNull(projects.deletedAt), scope))
      .orderBy(asc(clients.name))
      .limit(500)

    return { projects: projectRows, clients: clientRows }
  },
})
