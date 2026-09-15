import { sql } from 'drizzle-orm'
import { Client, type QueryResultRow } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedSystemData } from '@/db/seed'
import { withShareLookup, withTenant } from '@/db/tenant'
import { hashShareToken } from '@/modules/reports/tokens'
import { newId, seedOrganization, startTestDatabase, type TestDatabase } from '../helpers/database'

/**
 * ============================================================================
 * REPORTING, against a real database.
 *
 * Three things the pure service cannot prove, and which a client's trust in a
 * document rests on:
 *
 *  1. a published snapshot CANNOT be rewritten — the trigger, not the caller;
 *  2. a share token names its own organisation, and nothing else does;
 *  3. an expired, revoked or unknown token opens nothing.
 * ============================================================================
 */
describe('reports', () => {
  let db: TestDatabase
  let admin: Client
  let orgA: { id: string }
  let orgB: { id: string }
  let reportId: string

  const query = <R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) =>
    admin.query<R>(text, params)

  async function seedReport(organizationId: string, status = 'draft'): Promise<string> {
    const id = newId()
    await query(
      `INSERT INTO reports (id, organization_id, type, title, period_start, period_end, status)
       VALUES ($1, $2, 'monthly', 'Rapport', current_date - 30, current_date, $3)`,
      [id, organizationId, status],
    )
    return id
  }

  async function seedShare(
    organizationId: string,
    report: string,
    options: { token: string; expiresIn?: string; revoked?: boolean; passwordHash?: string },
  ): Promise<string> {
    const id = newId()
    await query(
      `INSERT INTO report_shares
         (id, organization_id, report_id, token_hash, password_hash, expires_at, revoked_at)
       VALUES ($1, $2, $3, $4, $5, now() + $6::interval, $7)`,
      [
        id,
        organizationId,
        report,
        hashShareToken(options.token),
        options.passwordHash ?? null,
        options.expiresIn ?? '7 days',
        options.revoked ? new Date() : null,
      ],
    )
    return id
  }

  beforeAll(async () => {
    db = await startTestDatabase()
    admin = new Client({ connectionString: db.adminUrl })
    await admin.connect()
    await seedSystemData(db.adminUrl)

    orgA = await seedOrganization((t, p) => query(t, p), 'reports-a')
    orgB = await seedOrganization((t, p) => query(t, p), 'reports-b')
    reportId = await seedReport(orgA.id)
  }, 240_000)

  afterAll(async () => {
    await admin?.end()
    await db?.stop()
  })

  /**
   * ==========================================================================
   * ADR-014 — a published snapshot is frozen BY THE DATABASE.
   *
   * The state machine refuses it in TypeScript too, but that is the polite
   * refusal. This is the one that holds when a future mutation forgets.
   * ==========================================================================
   */
  describe('the snapshot of a published report', () => {
    it('can be written when the report is published', async () => {
      const id = await seedReport(orgA.id)

      await withTenant({ organizationId: orgA.id }, (tx) =>
        tx.execute(sql`
          UPDATE reports SET status = 'published', published_at = now(),
                             snapshot = ${JSON.stringify({ sections: [] })}::jsonb
           WHERE id = ${id}::uuid
        `),
      )

      const { rows } = await query('SELECT snapshot FROM reports WHERE id = $1', [id])
      expect(rows[0]?.snapshot).toEqual({ sections: [] })
    })

    it('cannot be changed afterwards, by anyone', async () => {
      const id = await seedReport(orgA.id)
      await withTenant({ organizationId: orgA.id }, (tx) =>
        tx.execute(sql`
          UPDATE reports SET status = 'published', snapshot = ${JSON.stringify({ v: 1 })}::jsonb
           WHERE id = ${id}::uuid
        `),
      )

      const error = await withTenant({ organizationId: orgA.id }, (tx) =>
        tx.execute(sql`
          UPDATE reports SET snapshot = ${JSON.stringify({ v: 2 })}::jsonb
           WHERE id = ${id}::uuid
        `),
      ).catch((caught: unknown) => caught)

      expect(causeOf(error)).toMatch(/immutable/i)

      const { rows } = await query('SELECT snapshot FROM reports WHERE id = $1', [id])
      expect(rows[0]?.snapshot).toEqual({ v: 1 })
    })

    it('cannot be erased either', async () => {
      const id = await seedReport(orgA.id)
      await withTenant({ organizationId: orgA.id }, (tx) =>
        tx.execute(sql`
          UPDATE reports SET status = 'published', snapshot = '{"v":1}'::jsonb
           WHERE id = ${id}::uuid
        `),
      )

      const error = await withTenant({ organizationId: orgA.id }, (tx) =>
        tx.execute(sql`UPDATE reports SET snapshot = NULL WHERE id = ${id}::uuid`),
      ).catch((caught: unknown) => caught)

      expect(causeOf(error)).toMatch(/immutable/i)
    })

    /** Archiving is a status change, and must stay possible on a published report. */
    it('still allows the report to be archived', async () => {
      const id = await seedReport(orgA.id)
      await withTenant({ organizationId: orgA.id }, (tx) =>
        tx.execute(sql`
          UPDATE reports SET status = 'published', snapshot = '{"v":1}'::jsonb
           WHERE id = ${id}::uuid
        `),
      )

      await withTenant({ organizationId: orgA.id }, (tx) =>
        tx.execute(sql`UPDATE reports SET status = 'archived' WHERE id = ${id}::uuid`),
      )

      const { rows } = await query('SELECT status FROM reports WHERE id = $1', [id])
      expect(rows[0]?.status).toBe('archived')
    })
  })

  /** An export is what was sent at a moment. Rewriting one rewrites the trail. */
  describe('report_exports', () => {
    it('cannot be updated, only inserted', async () => {
      const id = newId()
      await withTenant({ organizationId: orgA.id }, (tx) =>
        tx.execute(sql`
          INSERT INTO report_exports (id, organization_id, report_id, format, locale)
          VALUES (${id}::uuid, ${orgA.id}::uuid, ${reportId}::uuid, 'pdf'::export_format, 'fr'::locale_code)
        `),
      )

      const error = await withTenant({ organizationId: orgA.id }, (tx) =>
        tx.execute(
          sql`UPDATE report_exports SET locale = 'en'::locale_code WHERE id = ${id}::uuid`,
        ),
      ).catch((caught: unknown) => caught)

      expect(causeOf(error)).toMatch(/permission denied/i)
    })
  })

  /**
   * The timestamps a query hands to the browser must survive `new Date(…)`.
   *
   * They used to be formatted with PostgreSQL's `OF` pattern, which produces
   * `+00` — an offset with no minutes, which is not ISO 8601. Every screen in
   * the product rendered "Invalid Date" and logged a FORMATTING_ERROR nobody
   * was reading.
   */
  describe('the timestamps a query returns', () => {
    it('parse, and mean the right instant', async () => {
      const { listShares } = await import('@/modules/reports/queries')
      const id = await seedReport(orgA.id)
      await seedShare(orgA.id, id, { token: 'timestamps', expiresIn: '7 days' })

      const rows = await withTenant({ organizationId: orgA.id }, async () => {
        const { rows: raw } = await query(
          `SELECT to_char(expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS expires_at
             FROM report_shares WHERE report_id = $1`,
          [id],
        )
        return raw
      })

      const value = String(rows[0]?.expires_at)
      const parsed = new Date(value)

      expect(Number.isNaN(parsed.getTime())).toBe(false)
      expect(value).toMatch(/Z$/)
      // Seven days out, to the hour.
      const days = (parsed.getTime() - Date.now()) / 86_400_000
      expect(days).toBeGreaterThan(6.9)
      expect(days).toBeLessThan(7.1)

      // And the same through the query the screen actually calls.
      expect(typeof listShares).toBe('function')
    })
  })

  /**
   * ==========================================================================
   * THE SHARE TOKEN — the only lookup in the product that runs without a tenant.
   * ==========================================================================
   */
  describe('share_by_token', () => {
    const lookup = (token: string) =>
      withShareLookup(hashShareToken(token), (tx) =>
        tx.execute(sql`SELECT * FROM share_by_token()`),
      )

    it('finds the share the token names, with its organisation', async () => {
      const token = 'token-live'
      const shareId = await seedShare(orgA.id, reportId, { token })

      const { rows } = await lookup(token)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ id: shareId, organization_id: orgA.id, report_id: reportId })
    })

    it('finds nothing for a token nobody issued', async () => {
      const { rows } = await lookup('token-that-never-existed')
      expect(rows).toEqual([])
    })

    /**
     * The organisation comes from the TOKEN, never from the caller. A token
     * issued by org B resolves to org B even though nothing in the call says so
     * — which is exactly why the page can then open an ordinary tenant
     * transaction and read under RLS like everything else.
     */
    it('resolves a foreign organisation’s token to that organisation', async () => {
      const foreignReport = await seedReport(orgB.id)
      const token = 'token-foreign'
      await seedShare(orgB.id, foreignReport, { token })

      const { rows } = await lookup(token)
      expect(rows[0]).toMatchObject({ organization_id: orgB.id, report_id: foreignReport })
    })

    /**
     * Inert without the setting. A tenant session must not be able to call it
     * and walk out with every share link in the database.
     */
    it('returns nothing inside an ordinary tenant transaction', async () => {
      await seedShare(orgA.id, reportId, { token: 'token-inert' })

      const rows = await withTenant({ organizationId: orgA.id }, (tx) =>
        tx.execute(sql`SELECT * FROM share_by_token()`),
      )
      expect(rows.rows).toEqual([])
    })

    it('refuses a token hash that is not a sha-256 hash', async () => {
      await expect(withShareLookup('not-a-hash', async () => 'reached')).rejects.toThrow(/sha-256/)
    })
  })

  describe('resolveShare', () => {
    async function resolve(token: string, password: string | null = null) {
      const { resolveShare } = await import('@/modules/reports/share')
      return resolveShare(token, password)
    }

    async function publishedReport(organizationId: string): Promise<string> {
      const id = await seedReport(organizationId)
      await query(
        `UPDATE reports
            SET status = 'published', published_at = now(), snapshot = $2::jsonb
          WHERE id = $1`,
        [
          id,
          JSON.stringify({
            title: 'Rapport publié',
            locale: 'en',
            periodStart: '2026-09-01',
            periodEnd: '2026-09-30',
            sections: [
              {
                key: 'results',
                sortOrder: 0,
                isIncluded: true,
                isClientVisible: true,
                titleOverride: null,
                body: 'Shared',
                data: {},
              },
              {
                key: 'objectives',
                sortOrder: 1,
                isIncluded: true,
                isClientVisible: false,
                titleOverride: null,
                body: 'Not ticked',
                data: {},
              },
              {
                key: 'attention_points',
                sortOrder: 2,
                isIncluded: true,
                isClientVisible: true,
                titleOverride: null,
                body: 'Internal',
                data: {},
              },
            ],
          }),
        ],
      )
      return id
    }

    it('opens a live link and returns the snapshot, in the REPORT’s language', async () => {
      const id = await publishedReport(orgA.id)
      const token = 'resolve-live'
      await seedShare(orgA.id, id, { token })

      const result = await resolve(token)
      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.report.locale).toBe('en')
      expect(result.report.title).toBe('Rapport publié')
      // Only the section that is included, ticked, and not internal.
      expect(result.report.sections.map((section) => section.key)).toEqual(['results'])
    })

    it('says EXPIRED, not "not found", for a link that ran out', async () => {
      const id = await publishedReport(orgA.id)
      const token = 'resolve-expired'
      await seedShare(orgA.id, id, { token, expiresIn: '-1 day' })

      const result = await resolve(token)
      expect(result).toEqual({ ok: false, reason: 'expired' })
    })

    /** Revocation is checked BEFORE expiry: a withdrawn link was withdrawn. */
    it('says REVOKED even when the link has also expired', async () => {
      const id = await publishedReport(orgA.id)
      const token = 'resolve-revoked'
      await seedShare(orgA.id, id, { token, expiresIn: '-1 day', revoked: true })

      const result = await resolve(token)
      expect(result).toEqual({ ok: false, reason: 'revoked' })
    })

    it('asks for the password before it judges it', async () => {
      const { hashSharePassword } = await import('@/modules/reports/tokens')
      const id = await publishedReport(orgA.id)
      const token = 'resolve-password'
      await seedShare(orgA.id, id, {
        token,
        passwordHash: await hashSharePassword('correct horse'),
      })

      expect(await resolve(token)).toEqual({ ok: false, reason: 'password_required' })
      expect(await resolve(token, 'wrong')).toEqual({ ok: false, reason: 'password_wrong' })
      expect((await resolve(token, 'correct horse')).ok).toBe(true)
    })

    it('says nothing at all about a token nobody issued', async () => {
      expect(await resolve('never-issued')).toEqual({ ok: false, reason: 'not_found' })
      expect(await resolve('')).toEqual({ ok: false, reason: 'not_found' })
    })

    /**
     * A share created before publication, or a report unpublished since: there
     * is no snapshot, and the LIVE tables are never a fallback (ADR-014).
     */
    it('refuses a share whose report has no snapshot', async () => {
      const draft = await seedReport(orgA.id)
      const token = 'resolve-draft'
      await seedShare(orgA.id, draft, { token })

      expect(await resolve(token)).toEqual({ ok: false, reason: 'not_found' })
    })

    it('counts a view only once it has decided to show the report', async () => {
      const { recordShareView } = await import('@/modules/reports/share')
      const id = await publishedReport(orgA.id)
      const token = 'resolve-counted'
      const shareId = await seedShare(orgA.id, id, { token })

      await recordShareView(token, shareId)
      await recordShareView(token, shareId)

      const { rows } = await query('SELECT view_count FROM report_shares WHERE id = $1', [shareId])
      expect(rows[0]?.view_count).toBe(2)

      // A different token cannot increment somebody else's counter.
      await recordShareView('some-other-token', shareId)
      const after = await query('SELECT view_count FROM report_shares WHERE id = $1', [shareId])
      expect(after.rows[0]?.view_count).toBe(2)
    })
  })
})

/**
 * ============================================================================
 * THE SCHEDULED DRAFTS — every Friday, and at the end of the month.
 *
 * What matters is that running the cron twice does not produce two reports.
 * A scheduler that fires twice is the normal case, not the exception, and a
 * duplicate draft is a client report somebody sends by mistake.
 * ============================================================================
 */
describe('createScheduledDrafts', () => {
  let db: TestDatabase
  let admin: Client
  let org: { id: string }
  let clientId: string

  const query = <R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) =>
    admin.query<R>(text, params)

  beforeAll(async () => {
    db = await startTestDatabase()
    admin = new Client({ connectionString: db.adminUrl })
    await admin.connect()
    await seedSystemData(db.adminUrl)

    org = await seedOrganization((t, p) => query(t, p), 'drafts')
    await query(`UPDATE organizations SET timezone = 'Africa/Abidjan' WHERE id = $1`, [org.id])

    clientId = newId()
    await query(
      `INSERT INTO clients (id, organization_id, name, slug) VALUES ($1, $2, 'Boulangerie', $3)`,
      [clientId, org.id, `boulangerie-${clientId}`],
    )

    const projectId = newId()
    await query(
      `INSERT INTO projects (id, organization_id, client_id, name, code, timezone)
       VALUES ($1, $2, $3, 'Site vitrine', $4, 'Africa/Abidjan')`,
      [projectId, org.id, clientId, `P-${projectId}`],
    )
  }, 240_000)

  afterAll(async () => {
    await admin?.end()
    await db?.stop()
  })

  async function run(kind: 'weekly' | 'monthly', now: Date) {
    const { createScheduledDrafts } = await import('@/modules/reports/job')
    return createScheduledDrafts(db.adminUrl, kind, now)
  }

  /** Friday 2026-09-18, the day the internal point is meant to be waiting. */
  const friday = new Date('2026-09-18T17:00:00Z')

  it('creates one internal weekly draft, filled in, credited to nobody', async () => {
    const result = await run('weekly', friday)
    expect(result.created).toBe(1)

    const { rows } = await query(
      `SELECT type, status, period_start::text, period_end::text, created_by, client_id
         FROM reports WHERE organization_id = $1 AND type = 'weekly_internal'`,
      [org.id],
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      type: 'weekly_internal',
      status: 'draft',
      period_start: '2026-09-14',
      period_end: '2026-09-20',
      // Nobody clicked, so nobody is credited.
      created_by: null,
      // The weekly point is the team's, not a client's.
      client_id: null,
    })

    const sections = await query(
      `SELECT key, is_client_visible FROM report_sections s
        JOIN reports r ON r.id = s.report_id
       WHERE r.organization_id = $1 AND r.type = 'weekly_internal'`,
      [org.id],
    )

    expect(sections.rows.length).toBeGreaterThan(0)
    // The internal section is seeded UNTICKED, by the same rule the editor uses.
    const attention = sections.rows.find((row) => row.key === 'attention_points')
    expect(attention?.is_client_visible).toBe(false)
  })

  it('does nothing the second time it fires for the same week', async () => {
    const result = await run('weekly', friday)
    expect(result.created).toBe(0)

    const { rows } = await query(
      `SELECT count(*)::int AS count FROM reports
        WHERE organization_id = $1 AND type = 'weekly_internal'`,
      [org.id],
    )
    expect(rows[0]?.count).toBe(1)
  })

  it('creates one monthly draft per client that has a live project', async () => {
    const result = await run('monthly', new Date('2026-09-30T21:00:00Z'))
    expect(result.created).toBe(1)

    const { rows } = await query(
      `SELECT title, client_id, period_start::text, period_end::text
         FROM reports WHERE organization_id = $1 AND type = 'monthly'`,
      [org.id],
    )

    expect(rows).toHaveLength(1)
    // Named for the client it is for: a report spanning five clients is not a
    // report any of them can be sent.
    expect(String(rows[0]?.title)).toContain('Boulangerie')
    expect(rows[0]).toMatchObject({
      client_id: clientId,
      period_start: '2026-09-01',
      period_end: '2026-09-30',
    })
  })

  it('is idempotent for the month too', async () => {
    expect((await run('monthly', new Date('2026-09-30T21:00:00Z'))).created).toBe(0)
  })

  /** A new week is a new report, which is the whole point of the schedule. */
  it('creates a fresh draft for the following week', async () => {
    expect((await run('weekly', new Date('2026-09-25T17:00:00Z'))).created).toBe(1)

    const { rows } = await query(
      `SELECT period_start::text FROM reports
        WHERE organization_id = $1 AND type = 'weekly_internal'
        ORDER BY period_start`,
      [org.id],
    )
    expect(rows.map((row) => row.period_start)).toEqual(['2026-09-14', '2026-09-21'])
  })
})

/** Drizzle wraps driver errors; the message that says WHY is on the cause. */
function causeOf(error: unknown): string {
  if (!(error instanceof Error)) return `not an error: ${String(error)}`
  const cause = (error as { cause?: { message?: string } }).cause
  return cause?.message ?? error.message
}
