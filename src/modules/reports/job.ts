import 'server-only'

import { and, eq, isNull, sql } from 'drizzle-orm'
import { Client } from 'pg'
import { uuidv7 } from 'uuidv7'
import { clients, projects, reportSections, reports } from '@/db/schema'
import { type TenantDb, withTenant } from '@/db/tenant'
import type { Locale } from '@/i18n/routing'
import { lookupMessage } from '@/lib/i18n/translator'
import { logger } from '@/lib/logger'
import { type ReportScope, runProviders } from './providers'
import {
  defaultClientVisibility,
  defaultSectionsFor,
  type ScheduledPeriod,
  type ScheduleKind,
  scheduledPeriod,
} from './service'

/**
 * ============================================================================
 * THE SCHEDULED DRAFTS — every Friday, and at the end of each month.
 *
 * What it creates is a DRAFT, never a published report. A job that published
 * would be sending a client a document nobody read; a job that creates a draft
 * removes the part of the work that is pure retyping — the type, the scope,
 * the period, and the eleven sections already filled with the period's data —
 * and leaves the part that is judgement.
 *
 * Idempotent by construction: a draft already covering the same type, scope
 * and period stops the job creating a second one, so running it twice on a
 * Friday costs nothing. That matters more than it sounds — a cron that fires
 * twice is the normal case, not the exception.
 * ============================================================================
 */
export async function createScheduledDrafts(
  adminConnectionString: string,
  kind: ScheduleKind,
  now = new Date(),
): Promise<{ organizations: number; created: number }> {
  /**
   * The ONE cross-tenant question: which tenants exist. Answered here and
   * nowhere else; every read and write below goes through `withTenant`.
   */
  const admin = new Client({ connectionString: adminConnectionString })
  await admin.connect()

  try {
    const { rows: tenants } = await admin.query<{
      id: string
      timezone: string
      default_locale: string
    }>(
      `SELECT id, timezone, default_locale FROM organizations
        WHERE deleted_at IS NULL AND status = 'active'`,
    )

    let created = 0

    for (const tenant of tenants) {
      const period = scheduledPeriod(kind, now, tenant.timezone)
      const locale: Locale = tenant.default_locale === 'en' ? 'en' : 'fr'

      created += await withTenant({ organizationId: tenant.id }, (db) =>
        createDraftsFor(db, tenant.id, period, locale),
      )
    }

    return { organizations: tenants.length, created }
  } finally {
    await admin.end()
  }
}

/**
 * One organisation's drafts.
 *
 * The weekly point is INTERNAL and covers the whole organisation — one draft.
 * The monthly report is a client document, so there is one per client that has
 * a live project: a single report spanning five clients is not a report any of
 * them can be sent.
 */
async function createDraftsFor(
  db: TenantDb,
  organizationId: string,
  period: ScheduledPeriod,
  locale: Locale,
): Promise<number> {
  if (period.kind === 'weekly') {
    const title = draftTitle(locale, 'weeklyTitle', period.anchor)
    return (await createDraft(db, organizationId, period, locale, title, null)) ? 1 : 0
  }

  const rows = await db
    .selectDistinct({ id: clients.id, name: clients.name })
    .from(clients)
    .innerJoin(projects, eq(projects.clientId, clients.id))
    .where(
      and(
        isNull(clients.deletedAt),
        isNull(projects.deletedAt),
        sql`${projects.status} <> 'archived'`,
      ),
    )

  let created = 0

  for (const client of rows) {
    const title = `${client.name} — ${draftTitle(locale, 'monthlyTitle', period.anchor.slice(0, 7))}`
    if (await createDraft(db, organizationId, period, locale, title, client.id)) created += 1
  }

  return created
}

/** Returns false when a draft for this exact window already exists. */
async function createDraft(
  db: TenantDb,
  organizationId: string,
  period: ScheduledPeriod,
  locale: Locale,
  title: string,
  clientId: string | null,
): Promise<boolean> {
  const existing = await db
    .select({ id: reports.id })
    .from(reports)
    .where(
      and(
        eq(reports.type, period.type),
        eq(reports.periodStart, period.periodStart),
        eq(reports.periodEnd, period.periodEnd),
        clientId === null ? isNull(reports.clientId) : eq(reports.clientId, clientId),
        isNull(reports.projectId),
        isNull(reports.deletedAt),
      ),
    )
    .limit(1)

  if (existing.length > 0) return false

  const id = uuidv7()
  await db.insert(reports).values({
    id,
    organizationId,
    type: period.type,
    title,
    projectId: null,
    clientId,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    locale,
    status: 'draft',
    generatedAt: new Date(),
    // No `createdBy`: nobody clicked. The row says so rather than crediting
    // whoever happened to run the worker.
    createdBy: null,
  })

  const scope: ReportScope = {
    organizationId,
    projectId: null,
    clientId,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
  }

  const keys = defaultSectionsFor(period.type)
  const outcomes = await runProviders(db, scope, keys)

  await db.insert(reportSections).values(
    outcomes.map((outcome, index) => ({
      id: uuidv7(),
      organizationId,
      reportId: id,
      key: outcome.key,
      sortOrder: index,
      isIncluded: true,
      isClientVisible: defaultClientVisibility(outcome.key),
      // A provider that failed leaves its section empty and editable (R7).
      data: outcome.failed ? null : outcome.data,
    })),
  )

  logger.info({ organizationId, reportId: id, kind: period.kind }, 'scheduled report draft created')
  return true
}

/**
 * The draft's title, in the ORGANISATION's default language.
 *
 * Nobody asked for this report, so there is no author whose reporting language
 * could be read. The organisation's own default is the honest fallback, and
 * the first thing a person can change (ADR-011).
 */
function draftTitle(locale: Locale, key: 'weeklyTitle' | 'monthlyTitle', date: string): string {
  const template = lookupMessage(locale, `reports.drafts.${key}`) ?? '{date}'
  return template.replace('{date}', date)
}
