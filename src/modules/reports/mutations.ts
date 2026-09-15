'use server'

import { and, eq, isNull, sql } from 'drizzle-orm'
import { after } from 'next/server'
import { uuidv7 } from 'uuidv7'
import { clients, files, projects, reportSections, reportShares, reports } from '@/db/schema'
import type { TenantDb } from '@/db/tenant'
import { AppError } from '@/lib/errors/app-error'
import { MAX_SIGNED_URL_TTL_SECONDS, storage } from '@/lib/storage'
import { recordActivity } from '@/modules/activity'
import { defineAction } from '@/server'
import { exportRecipient, exportReportPdf, notifyExportReady } from './export'
import { type ReportScope, runProviders } from './providers'
import {
  archiveReportSchema,
  createReportSchema,
  createShareSchema,
  deleteReportSchema,
  exportReportSchema,
  publishReportSchema,
  regenerateSectionSchema,
  revokeShareSchema,
  updateReportSchema,
  updateSectionSchema,
} from './schemas'
import {
  canTransition,
  defaultClientVisibility,
  defaultSectionsFor,
  isEditable,
  isInternalSection,
  type ReportStatusValue,
  type SectionKey,
  shareExpiryFrom,
} from './service'
import { generateShareToken, hashSharePassword, hashShareToken } from './tokens'

/**
 * ============================================================================
 * Creating a report runs its providers straight away.
 *
 * The wizard's promise is "type → scope → period → language → **generation**":
 * a report that arrived empty would be a form, and the point of the lot is
 * that the raw data is already enough (cahier des charges §V2 rationale).
 *
 * A provider that fails costs its own section and nothing else (R7).
 * ============================================================================
 */
export const createReport = defineAction({
  input: createReportSchema,
  permission: 'report.create',
  handler: async (input, { actor, db, audit }) => {
    if (input.projectId) await requireProject(db, input.projectId)
    if (input.clientId) await requireClient(db, input.clientId)

    const id = uuidv7()
    await db.insert(reports).values({
      id,
      organizationId: actor.organizationId,
      type: input.type,
      title: input.title,
      projectId: input.projectId ?? null,
      clientId: input.clientId ?? null,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      locale: input.locale,
      createdBy: actor.userId,
      updatedBy: actor.userId,
    })

    const keys = defaultSectionsFor(input.type)
    const scope: ReportScope = {
      organizationId: actor.organizationId,
      projectId: input.projectId ?? null,
      clientId: input.clientId ?? null,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    }

    const outcomes = await runProviders(db, scope, keys)

    await db.insert(reportSections).values(
      outcomes.map((outcome, index) => ({
        id: uuidv7(),
        organizationId: actor.organizationId,
        reportId: id,
        key: outcome.key,
        sortOrder: index,
        isIncluded: true,
        isClientVisible: defaultClientVisibility(outcome.key),
        // A failed provider leaves `data` null: the section is empty and
        // editable, and the report is not blocked (R7).
        data: outcome.failed ? null : outcome.data,
      })),
    )

    await db.update(reports).set({ generatedAt: new Date() }).where(eq(reports.id, id))

    await recordActivity(db, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      verb: 'report.created',
      entityType: 'report',
      entityId: id,
      projectId: input.projectId ?? null,
      clientId: input.clientId ?? null,
      params: { name: input.title },
    })
    await audit({ action: 'report.create', entityType: 'report', entityId: id })

    return { id, failedSections: outcomes.filter((o) => o.failed).length }
  },
})

export const updateReport = defineAction({
  input: updateReportSchema,
  permission: 'report.create',
  handler: async (input, { actor, db, audit }) => {
    const before = await requireReport(db, input.id)
    assertEditable(before.status)

    await db
      .update(reports)
      .set({
        title: input.title ?? before.title,
        locale: input.locale ?? before.locale,
        updatedBy: actor.userId,
        updatedAt: new Date(),
      })
      .where(eq(reports.id, input.id))

    await audit({ action: 'report.update', entityType: 'report', entityId: input.id })
    return { id: input.id }
  },
})

/**
 * Editing one section.
 *
 * `is_edited` is set the moment a human writes prose, so regenerating can
 * refuse to overwrite it without asking.
 *
 * An INTERNAL section cannot be made client-visible, whatever arrives in the
 * payload. `isInternalSection` is the last word — the same shape as `what_didnt`
 * on an insight (ADR-065).
 */
export const updateSection = defineAction({
  input: updateSectionSchema,
  permission: 'report.create',
  handler: async (input, { db, audit }) => {
    const before = await requireSection(db, input.id)
    const report = await requireReport(db, before.reportId)
    assertEditable(report.status)

    const wantsVisible = input.isClientVisible ?? before.isClientVisible
    const isClientVisible = isInternalSection(before.key) ? false : wantsVisible

    await db
      .update(reportSections)
      .set({
        body: input.body === undefined ? before.body : (input.body ?? null),
        titleOverride:
          input.titleOverride === undefined ? before.titleOverride : (input.titleOverride ?? null),
        sortOrder: input.sortOrder ?? before.sortOrder,
        isIncluded: input.isIncluded ?? before.isIncluded,
        isClientVisible,
        isEdited: input.body !== undefined ? true : before.isEdited,
        updatedAt: new Date(),
      })
      .where(eq(reportSections.id, input.id))

    await audit({
      action: 'report.update_section',
      entityType: 'report',
      entityId: before.reportId,
      after: { section: before.key },
    })

    return { id: input.id }
  },
})

/** Re-runs one provider. The prose is left alone — only `data` is replaced. */
export const regenerateSection = defineAction({
  input: regenerateSectionSchema,
  permission: 'report.create',
  handler: async (input, { actor, db, audit }) => {
    const before = await requireSection(db, input.id)
    const report = await requireReport(db, before.reportId)
    assertEditable(report.status)

    const [outcome] = await runProviders(
      db,
      {
        organizationId: actor.organizationId,
        projectId: report.projectId,
        clientId: report.clientId,
        periodStart: report.periodStart,
        periodEnd: report.periodEnd,
      },
      [before.key],
    )

    await db
      .update(reportSections)
      .set({ data: outcome?.failed ? null : (outcome?.data ?? null), updatedAt: new Date() })
      .where(eq(reportSections.id, input.id))

    await audit({
      action: 'report.regenerate_section',
      entityType: 'report',
      entityId: before.reportId,
      after: { section: before.key, failed: outcome?.failed ?? true },
    })

    return { id: input.id, failed: outcome?.failed ?? true }
  },
})

/**
 * ============================================================================
 * PUBLICATION — the moment the data is FROZEN (ADR-014).
 *
 * The snapshot is built from the sections as they stand and written in the
 * SAME transaction as the status change. A report that became `published`
 * without its snapshot would be a document whose content could still move.
 *
 * A database trigger refuses to change a published snapshot afterwards, so the
 * guarantee does not depend on this function staying correct.
 * ============================================================================
 */
export const publishReport = defineAction({
  input: publishReportSchema,
  permission: 'report.publish',
  handler: async (input, { actor, db, audit }) => {
    const before = await requireReport(db, input.id)

    if (!canTransition(before.status, 'published')) {
      throw new AppError('validation_failed', 'errors.report_not_publishable')
    }

    const sections = await db
      .select({
        key: reportSections.key,
        sortOrder: reportSections.sortOrder,
        isIncluded: reportSections.isIncluded,
        isClientVisible: reportSections.isClientVisible,
        titleOverride: reportSections.titleOverride,
        body: reportSections.body,
        data: reportSections.data,
      })
      .from(reportSections)
      .where(eq(reportSections.reportId, input.id))
      .orderBy(reportSections.sortOrder)

    const snapshot = {
      publishedAt: new Date().toISOString(),
      title: before.title,
      locale: before.locale,
      periodStart: before.periodStart,
      periodEnd: before.periodEnd,
      sections,
    }

    await db
      .update(reports)
      .set({
        status: 'published',
        publishedAt: new Date(),
        snapshot,
        updatedBy: actor.userId,
        updatedAt: new Date(),
      })
      .where(eq(reports.id, input.id))

    await recordActivity(db, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      verb: 'report.published',
      entityType: 'report',
      entityId: input.id,
      projectId: before.projectId,
      clientId: before.clientId,
      params: { name: before.title },
      // The client is told their report is ready.
      visibility: 'shared',
    })
    await audit({
      action: 'report.publish',
      entityType: 'report',
      entityId: input.id,
      after: { sections: sections.length },
    })

    return { id: input.id }
  },
})

export const archiveReport = defineAction({
  input: archiveReportSchema,
  permission: 'report.publish',
  handler: async (input, { actor, db, audit }) => {
    const before = await requireReport(db, input.id)
    if (!canTransition(before.status, 'archived')) {
      throw new AppError('validation_failed', 'errors.invalid_transition')
    }

    await db
      .update(reports)
      .set({ status: 'archived', updatedBy: actor.userId, updatedAt: new Date() })
      .where(eq(reports.id, input.id))

    await audit({ action: 'report.archive', entityType: 'report', entityId: input.id })
    return { id: input.id }
  },
})

export const deleteReport = defineAction({
  input: deleteReportSchema,
  permission: 'report.create',
  handler: async (input, { actor, db, audit }) => {
    const before = await requireReport(db, input.id)

    await db
      .update(reports)
      .set({ deletedAt: new Date(), updatedBy: actor.userId })
      .where(eq(reports.id, input.id))

    await audit({
      action: 'report.delete',
      entityType: 'report',
      entityId: input.id,
      before: { title: before.title, status: before.status },
    })
    return { id: input.id }
  },
})

/**
 * ============================================================================
 * A SHARE LINK.
 *
 * The token is returned ONCE, here, and never stored in clear — like an API
 * key. `listShares` cannot return it, because no query selects `token_hash`
 * and the token itself exists nowhere.
 *
 * Only a PUBLISHED report can be shared: sharing a draft would share a
 * document that is still changing.
 * ============================================================================
 */
export const createShare = defineAction({
  input: createShareSchema,
  permission: 'report.publish',
  handler: async (input, { actor, db, audit }) => {
    const report = await requireReport(db, input.reportId)

    if (report.status !== 'published') {
      throw new AppError('validation_failed', 'errors.report_not_published')
    }

    const token = generateShareToken()
    const id = uuidv7()

    await db.insert(reportShares).values({
      id,
      organizationId: actor.organizationId,
      reportId: input.reportId,
      tokenHash: hashShareToken(token),
      passwordHash: input.password ? await hashSharePassword(input.password) : null,
      // Bounded by the service: "at most 90 days" is a product rule.
      expiresAt: shareExpiryFrom(new Date(), input.expiresInDays),
      recipientEmail: input.recipientEmail ?? null,
      createdBy: actor.userId,
    })

    await audit({
      action: 'report.share',
      entityType: 'report',
      entityId: input.reportId,
      after: { shareId: id, hasPassword: Boolean(input.password) },
    })

    // The only time the token exists outside the caller's browser.
    return { id, token }
  },
})

export const revokeShare = defineAction({
  input: revokeShareSchema,
  permission: 'report.publish',
  handler: async (input, { db, audit }) => {
    const [share] = await db
      .select({ id: reportShares.id, reportId: reportShares.reportId })
      .from(reportShares)
      .where(eq(reportShares.id, input.id))
      .limit(1)

    if (!share) throw new AppError('not_found', 'errors.not_found')

    await db
      .update(reportShares)
      .set({ revokedAt: new Date() })
      .where(eq(reportShares.id, input.id))

    await audit({
      action: 'report.revoke_share',
      entityType: 'report',
      entityId: share.reportId,
      after: { shareId: input.id },
    })

    return { id: input.id }
  },
})

/**
 * ============================================================================
 * EXPORTING TO PDF.
 *
 * The roadmap asks for a JOB, and the reason a job is asked for is that
 * rendering must not hold a request open. What makes that possible is not a
 * queue — it is that `exportReportPdf` takes a transaction and a locale and
 * reads only the frozen snapshot, so it runs identically from a request, from
 * a worker, or from a CLI.
 *
 * No queue is installed yet (pg-boss arrives with the notification work at
 * LOT 14), and inventing one for a single caller would be the premature
 * abstraction rule 8 warns about. So today the action awaits it: a report's
 * snapshot is a few dozen rows and the render is well under a second. The day
 * the queue exists, this handler enqueues instead of awaiting — and the
 * function it calls does not change.
 *
 * The notification is sent AFTER the transaction commits: a mail server being
 * slow must not hold a database connection, and a mail that fails must not
 * undo an export that succeeded.
 * ============================================================================
 */
export const exportReport = defineAction({
  input: exportReportSchema,
  permission: 'report.export',
  handler: async (input, { actor, db, audit }) => {
    const report = await requireReport(db, input.id)

    const result = await exportReportPdf(db, {
      reportId: input.id,
      organizationId: actor.organizationId,
      requestedBy: actor.userId,
    })

    const [stored] = await db
      .select({ storageKey: files.storageKey })
      .from(files)
      .where(eq(files.id, result.fileId))
      .limit(1)

    if (!stored) throw new AppError('not_found', 'errors.not_found')

    // Five minutes, like every other download in the product (R13).
    const url = await storage().signedUrl(stored.storageKey, MAX_SIGNED_URL_TTL_SECONDS)
    const recipient = await exportRecipient(db, actor.userId)

    await audit({
      action: 'report.export',
      entityType: 'report',
      entityId: input.id,
      after: { exportId: result.exportId, format: 'pdf' },
    })

    // After the response, and after the transaction: the reader already has
    // their download link, the mail is the copy that outlives the tab.
    if (recipient) {
      after(() => notifyExportReady({ ...recipient, reportTitle: report.title, url }))
    }

    return { ...result, url }
  },
})

function assertEditable(status: ReportStatusValue): void {
  // ADR-014: a published report is frozen. Correcting one means publishing a
  // new one, which the interface says out loud.
  if (!isEditable(status)) {
    throw new AppError('validation_failed', 'errors.report_published')
  }
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

async function requireClient(db: TenantDb, clientId: string) {
  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), isNull(clients.deletedAt)))
    .limit(1)

  if (!client) throw new AppError('not_found', 'errors.not_found')
  return client
}

async function requireReport(db: TenantDb, id: string) {
  const [row] = await db
    .select({
      id: reports.id,
      title: reports.title,
      status: reports.status,
      locale: reports.locale,
      projectId: reports.projectId,
      clientId: reports.clientId,
      periodStart: reports.periodStart,
      periodEnd: reports.periodEnd,
    })
    .from(reports)
    .where(and(eq(reports.id, id), isNull(reports.deletedAt)))
    .limit(1)

  if (!row) throw new AppError('not_found', 'errors.report_not_found')
  return row
}

async function requireSection(db: TenantDb, id: string) {
  const [row] = await db
    .select({
      id: reportSections.id,
      reportId: reportSections.reportId,
      key: reportSections.key,
      sortOrder: reportSections.sortOrder,
      isIncluded: reportSections.isIncluded,
      isClientVisible: reportSections.isClientVisible,
      titleOverride: reportSections.titleOverride,
      body: reportSections.body,
      isEdited: reportSections.isEdited,
    })
    .from(reportSections)
    .where(eq(reportSections.id, id))
    .limit(1)

  if (!row) throw new AppError('not_found', 'errors.not_found')
  return { ...row, key: row.key as SectionKey }
}

/** Kept exported for the scheduled draft job (LOT 12 item 9). */
export async function countDraftsFor(db: TenantDb, organizationId: string): Promise<number> {
  const rows = await db.execute(sql`
    SELECT count(*)::int AS count FROM reports
     WHERE organization_id = ${organizationId} AND status = 'draft' AND deleted_at IS NULL
  `)
  return Number((rows.rows[0] as { count?: number } | undefined)?.count ?? 0)
}
