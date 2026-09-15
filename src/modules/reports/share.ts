import 'server-only'

import { eq, sql } from 'drizzle-orm'
import { organizations, reports } from '@/db/schema'
import { withShareLookup, withTenant } from '@/db/tenant'
import { logger } from '@/lib/logger'
import { checkShare, type SectionKey, type ShareVerdict, sharedSections } from './service'
import { hashShareToken, verifySharePassword } from './tokens'
import type { SharedReport } from './types'

/**
 * ============================================================================
 * OPENING A SHARE LINK — the only read path in the product with no session.
 *
 * Three steps, deliberately separate:
 *
 *   1. the TOKEN names the share          → `share_by_token()`, SECURITY DEFINER,
 *                                            returns metadata only (no content)
 *   2. the pure service says yes or no    → `checkShare`, with a reason
 *   3. the SNAPSHOT is read under RLS     → an ordinary `withTenant`
 *
 * The organisation is never taken from the URL: it comes from the token. And
 * the content read in step 3 is the frozen snapshot (ADR-014), so a share link
 * touches no live table at all — editing a project cannot change what a client
 * already received.
 * ============================================================================
 */
export type ShareResolution =
  | { ok: true; report: SharedReport; shareId: string }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'revoked' | 'expired' | 'password_required' | 'password_wrong' }

/**
 * The shape `share_by_token()` actually returns.
 *
 * The timestamps are declared `unknown` on purpose: `db.execute` with raw SQL
 * does NOT go through Drizzle's column mappers, and the driver hands back a
 * string where a typed select would hand back a `Date`. Declaring `Date` here
 * compiled perfectly and threw `share.expiresAt.getTime is not a function` on
 * the first real share link — which an integration test found, and the type
 * checker never could.
 */
type ShareMetadata = {
  id: string
  organization_id: string
  report_id: string
  password_hash: string | null
  expires_at: unknown
  revoked_at: unknown
}

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
  publishedAt?: string
  title?: string
  locale?: 'fr' | 'en'
  periodStart?: string
  periodEnd?: string
  sections?: SnapshotSection[]
}

export async function resolveShare(
  token: string,
  password: string | null,
): Promise<ShareResolution> {
  const tokenHash = safeHash(token)
  if (!tokenHash) return { ok: false, reason: 'not_found' }

  const share = await withShareLookup(tokenHash, async (db) => {
    const result = await db.execute(sql`SELECT * FROM share_by_token()`)
    return (result.rows[0] as ShareMetadata | undefined) ?? null
  })

  // A token that names nothing and a token that names something revoked are
  // told apart on purpose: the second one existed, and the person holding it
  // deserves to know it was withdrawn rather than mistyped.
  if (!share) return { ok: false, reason: 'not_found' }

  const expiresAt = toDate(share.expires_at)
  // A share with no readable expiry is not a share: the column is NOT NULL, so
  // this can only mean the row is broken, and a broken row opens nothing.
  if (!expiresAt) return { ok: false, reason: 'not_found' }

  const verdict: ShareVerdict = checkShare(
    {
      revokedAt: toDate(share.revoked_at),
      expiresAt,
      passwordHash: share.password_hash,
    },
    {
      now: new Date(),
      passwordMatches: await matchPassword(share.password_hash, password),
    },
  )

  if (!verdict.ok) return verdict

  const report = await withTenant({ organizationId: share.organization_id }, async (db) => {
    const rows = await db
      .select({
        snapshot: reports.snapshot,
        publishedAt: sql<string | null>`to_char(${reports.publishedAt}, 'YYYY-MM-DD')`,
        organizationName: organizations.name,
      })
      .from(reports)
      .innerJoin(organizations, eq(organizations.id, reports.organizationId))
      .where(eq(reports.id, share.report_id))
      .limit(1)

    return rows[0] ?? null
  })

  // A share created before publication, or a report unpublished since. Either
  // way there is no snapshot to show, and the live tables are not a fallback.
  if (!report?.snapshot) return { ok: false, reason: 'not_found' }

  return {
    ok: true,
    shareId: share.id,
    report: toSharedReport(report.snapshot as Snapshot, {
      organizationName: report.organizationName,
      publishedAt: report.publishedAt,
    }),
  }
}

/** Counting a view. Never blocks the page: a missed count is not an error. */
export async function recordShareView(token: string, shareId: string): Promise<void> {
  const tokenHash = safeHash(token)
  if (!tokenHash) return

  try {
    await withShareLookup(tokenHash, (db) =>
      db.execute(sql`SELECT share_record_view(${shareId}::uuid)`),
    )
  } catch (error) {
    logger.error({ err: error, shareId }, 'failed to record a share view')
  }
}

/** A timestamp from a raw query: a `Date` from some drivers, a string from others. */
function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value !== 'string' || value === '') return null

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function safeHash(token: string): string | null {
  if (!token || token.length > 200) return null
  return hashShareToken(token)
}

/**
 * `null` means "no password was offered", which `checkShare` reads as
 * `password_required` — distinct from a wrong one. When the share carries no
 * password at all the answer is irrelevant, and no hashing is done.
 */
async function matchPassword(
  passwordHash: string | null,
  password: string | null,
): Promise<boolean | null> {
  if (!passwordHash) return null
  if (password === null) return null
  return verifySharePassword(password, passwordHash)
}

function toSharedReport(
  snapshot: Snapshot,
  context: { organizationName: string; publishedAt: string | null },
): SharedReport {
  const sections = sharedSections(snapshot.sections ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)

  return {
    title: snapshot.title ?? '',
    locale: snapshot.locale ?? 'fr',
    periodStart: snapshot.periodStart ?? '',
    periodEnd: snapshot.periodEnd ?? '',
    organizationName: context.organizationName,
    publishedAt: context.publishedAt,
    sections: sections.map((section) => ({
      key: section.key,
      title: section.titleOverride,
      body: section.body,
      data: section.data,
    })),
  }
}
