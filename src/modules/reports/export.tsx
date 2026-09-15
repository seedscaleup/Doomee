import 'server-only'

import { renderToBuffer } from '@react-pdf/renderer'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import { clients, organizations, projects, reportExports, reports, users } from '@/db/schema'
import type { TenantDb } from '@/db/tenant'
import type { Locale } from '@/i18n/routing'
import { AppError } from '@/lib/errors/app-error'
import { translator } from '@/lib/i18n/translator'
import { logger } from '@/lib/logger'
import { mailer } from '@/lib/mail'
import { storeFile } from '@/modules/files'
import { type PdfReport, ReportDocument } from './pdf/document'
import { configurePdfFonts } from './pdf/fonts'
import { preferencesFor, presentSection } from './present'
import { includedSections, type SectionKey } from './service'

/**
 * ============================================================================
 * EXPORTING A REPORT AS A PDF.
 *
 * A plain async function, taking a transaction and an explicit locale, so the
 * SAME code produces the file whether a person clicked Export or a worker is
 * draining a queue (ADR-071, the lesson of the health job: two ways of
 * producing one artefact is how they come to disagree).
 *
 * What it reads is the SNAPSHOT (ADR-014). A published report cannot change,
 * so exporting it twice a month apart must produce the same document — if the
 * export read the live tables, the PDF in a client's inbox would quietly stop
 * matching the one they were sent.
 * ============================================================================
 */
type SnapshotSection = {
  key: SectionKey
  sortOrder: number
  isIncluded: boolean
  isClientVisible: boolean
  titleOverride: string | null
  body: string | null
  data: unknown
}

type Snapshot = {
  title?: string
  locale?: Locale
  periodStart?: string
  periodEnd?: string
  publishedAt?: string
  sections?: SnapshotSection[]
}

export type ExportResult = { exportId: string; fileId: string; filename: string }

export async function exportReportPdf(
  db: TenantDb,
  input: { reportId: string; organizationId: string; requestedBy: string },
): Promise<ExportResult> {
  const report = await readPublishedReport(db, input.reportId)
  const bytes = await renderReportPdf(report)

  const filename = `${slugify(report.title)}-${report.periodEnd}.pdf`

  const file = await storeFile(db, {
    organizationId: input.organizationId,
    uploadedBy: input.requestedBy,
    kind: 'report',
    filename,
    mimeType: 'application/pdf',
    extension: 'pdf',
    bytes,
  })

  const exportId = uuidv7()
  await db.insert(reportExports).values({
    id: exportId,
    organizationId: input.organizationId,
    reportId: input.reportId,
    format: 'pdf',
    fileId: file.id,
    // The document's language, not the exporter's (ADR-011).
    locale: report.locale,
    generatedBy: input.requestedBy,
  })

  return { exportId, fileId: file.id, filename }
}

/** The rendering itself: snapshot in, bytes out. No database, no storage. */
export async function renderReportPdf(report: PdfReport): Promise<Uint8Array> {
  configurePdfFonts()
  return renderToBuffer(<ReportDocument report={report} />)
}

/**
 * Builds the document's data from the snapshot.
 *
 * `includedSections` decides what is in, and `presentSection` shapes each one —
 * the same two functions the editor and the share page use, so the three
 * surfaces cannot drift apart.
 */
export async function readPublishedReport(db: TenantDb, reportId: string): Promise<PdfReport> {
  const [row] = await db
    .select({
      snapshot: reports.snapshot,
      title: reports.title,
      locale: reports.locale,
      periodStart: reports.periodStart,
      periodEnd: reports.periodEnd,
      publishedAt: sql<string | null>`to_char(${reports.publishedAt}, 'YYYY-MM-DD')`,
      organizationName: organizations.name,
      projectName: projects.name,
      clientName: clients.name,
    })
    .from(reports)
    .innerJoin(organizations, eq(organizations.id, reports.organizationId))
    .leftJoin(projects, eq(projects.id, reports.projectId))
    .leftJoin(clients, eq(clients.id, reports.clientId))
    .where(and(eq(reports.id, reportId), isNull(reports.deletedAt)))
    .limit(1)

  if (!row) throw new AppError('not_found', 'errors.report_not_found')

  // Exporting a draft would put a document in the world that the next edit
  // contradicts. The answer is to publish, not to export anyway.
  if (!row.snapshot) throw new AppError('validation_failed', 'errors.report_not_published')

  const snapshot: Snapshot = row.snapshot
  const locale: Locale = snapshot.locale ?? row.locale
  const preferences = preferencesFor(locale, 'UTC')

  return {
    title: snapshot.title ?? row.title,
    locale,
    organizationName: row.organizationName,
    projectName: row.projectName,
    clientName: row.clientName,
    periodStart: snapshot.periodStart ?? row.periodStart,
    periodEnd: snapshot.periodEnd ?? row.periodEnd,
    publishedAt: row.publishedAt,
    sections: includedSections(snapshot.sections ?? []).map((section) => ({
      key: section.key,
      title: section.titleOverride,
      blocks: presentSection(section.key, section.data, preferences),
      body: section.body,
    })),
  }
}

/**
 * Who to tell, and in which language.
 *
 * Read inside the caller's transaction, because that is the only place the
 * users table is readable — and read as DATA, so the message itself can be
 * sent once the transaction has committed.
 */
export async function exportRecipient(
  db: TenantDb,
  userId: string,
): Promise<{ email: string; locale: Locale } | null> {
  const [row] = await db
    .select({ email: users.email, locale: users.locale })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!row?.email) return null
  return { email: row.email, locale: row.locale === 'en' ? 'en' : 'fr' }
}

/**
 * "Notification à la fin" (roadmap LOT 12.6).
 *
 * In the RECIPIENT's language, taken from their own row — never the report's,
 * and never the language of whoever asked (ADR-011). A French account manager
 * exporting an English report is told about it in French.
 *
 * Takes no database handle on purpose: it runs after the transaction has
 * committed, so a slow mail server never holds a connection open, and a mail
 * that fails never undoes an export that succeeded. Its failure is logged.
 */
export async function notifyExportReady(input: {
  email: string
  locale: Locale
  reportTitle: string
  url: string
}): Promise<void> {
  const t = translator(input.locale)

  try {
    await mailer().send({
      to: input.email,
      locale: input.locale,
      subject: `${t('reports.editor.exportReady')} — ${input.reportTitle}`,
      text: `${input.reportTitle}\n\n${input.url}`,
      html: `<p>${escapeHtml(input.reportTitle)}</p><p><a href="${escapeHtml(input.url)}">${escapeHtml(input.url)}</a></p>`,
    })
  } catch (error) {
    logger.error({ err: error, email: input.email }, 'report export notification failed')
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** A filename a person can find again in a downloads folder. */
export function slugify(value: string): string {
  const slug = value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

  return slug || 'report'
}
