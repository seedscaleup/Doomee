import { sql } from 'drizzle-orm'
import { Client, type QueryResultRow } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedSystemData } from '@/db/seed'
import { withTenant } from '@/db/tenant'
import { newId, seedOrganization, startTestDatabase, type TestDatabase } from '../helpers/database'

/**
 * Drizzle wraps driver errors in a "Failed query:" envelope; the message that
 * says WHY is on the cause. Asserting on the envelope would pass for any
 * failure at all — including the one where the write actually succeeded and
 * something else broke.
 */
async function pgErrorOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run()
  } catch (error) {
    const cause = (error as { cause?: { message?: string } }).cause
    return cause?.message ?? (error as Error).message
  }
  throw new Error('the statement was expected to fail, and did not')
}

/**
 * The validation cycle, against a real database.
 *
 * What the pure service proves is that the state machine's TABLE is right.
 * What matters here is that the database backs it up: an approval that was
 * recorded stays recorded, a version cannot be rewritten, and one organisation
 * never reaches another's work.
 */
describe('the deliverable cycle', () => {
  let db: TestDatabase
  let admin: Client
  let orgA: { id: string }
  let orgB: { id: string }
  let projectA: string
  let deliverableA: string
  let versionA: string

  const query = <R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) =>
    admin.query<R>(text, params)

  beforeAll(async () => {
    db = await startTestDatabase()
    admin = new Client({ connectionString: db.adminUrl })
    await admin.connect()
    await seedSystemData(db.adminUrl)

    orgA = await seedOrganization((text, params) => query(text, params), 'deliv-a')
    orgB = await seedOrganization((text, params) => query(text, params), 'deliv-b')

    projectA = await seedProject(orgA.id)
    deliverableA = await seedDeliverable(orgA.id, projectA, 'Charte graphique')
    versionA = await seedVersion(orgA.id, deliverableA, 1)
  }, 180_000)

  afterAll(async () => {
    await admin?.end()
    await db?.stop()
  })

  async function seedProject(organizationId: string): Promise<string> {
    const id = newId()
    await query(
      `INSERT INTO projects (id, organization_id, name, code, timezone)
       VALUES ($1, $2, 'Refonte', $3, 'Africa/Abidjan')`,
      [id, organizationId, `P-${id.slice(0, 8)}`],
    )
    return id
  }

  async function seedDeliverable(
    organizationId: string,
    projectId: string,
    title: string,
  ): Promise<string> {
    const id = newId()
    await query(
      'INSERT INTO deliverables (id, organization_id, project_id, title) VALUES ($1, $2, $3, $4)',
      [id, organizationId, projectId, title],
    )
    return id
  }

  async function seedVersion(
    organizationId: string,
    deliverableId: string,
    version: number,
  ): Promise<string> {
    const id = newId()
    await query(
      `INSERT INTO deliverable_versions
         (id, organization_id, deliverable_id, version, external_url)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, organizationId, deliverableId, version, `https://example.test/v${version}`],
    )
    return id
  }

  /**
   * The composite tenant key, doing its job. Even if every check above it were
   * buggy, the database refuses to hang one organisation's version off
   * another's deliverable.
   */
  it('refuses a version attached to another organisation’s deliverable', async () => {
    await expect(
      query(
        `INSERT INTO deliverable_versions
           (id, organization_id, deliverable_id, version, external_url)
         VALUES ($1, $2, $3, 9, 'https://example.test/x')`,
        [newId(), orgB.id, deliverableA],
      ),
    ).rejects.toThrow(/violates foreign key constraint/i)
  })

  it('refuses a review attached to another organisation’s version', async () => {
    await expect(
      query(
        `INSERT INTO deliverable_reviews
           (id, organization_id, deliverable_id, version_id, scope, decision)
         VALUES ($1, $2, $3, $4, 'client', 'approved')`,
        [newId(), orgB.id, deliverableA, versionA],
      ),
    ).rejects.toThrow(/violates foreign key constraint/i)
  })

  /** One deliverable cannot have two version 2s. */
  it('refuses a duplicate version number', async () => {
    const second = await seedVersion(orgA.id, deliverableA, 2)
    expect(second).toBeTruthy()

    await expect(seedVersion(orgA.id, deliverableA, 2)).rejects.toThrow(
      /duplicate key value|unique constraint/i,
    )
  })

  /**
   * A decision that was made stays made.
   *
   * If UPDATE were ever granted, "the client approved version 3" could quietly
   * become "the client approved version 5" — and the validation trail would be
   * worth exactly nothing.
   */
  it('refuses to rewrite a review', async () => {
    const reviewId = newId()
    await query(
      `INSERT INTO deliverable_reviews
         (id, organization_id, deliverable_id, version_id, scope, decision, comment)
       VALUES ($1, $2, $3, $4, 'client', 'approved', 'Parfait')`,
      [reviewId, orgA.id, deliverableA, versionA],
    )

    const message = await pgErrorOf(() =>
      withTenant({ organizationId: orgA.id }, (tx) =>
        tx.execute(sql`
          UPDATE deliverable_reviews SET decision = 'changes_requested' WHERE id = ${reviewId}
        `),
      ),
    )
    expect(message).toMatch(/permission denied for table deliverable_reviews/i)
  })

  /** A version is the same kind of fact: correct it by uploading the next one. */
  it('refuses to rewrite a version', async () => {
    const message = await pgErrorOf(() =>
      withTenant({ organizationId: orgA.id }, (tx) =>
        tx.execute(sql`
          UPDATE deliverable_versions SET external_url = 'https://evil.test' WHERE id = ${versionA}
        `),
      ),
    )
    expect(message).toMatch(/permission denied for table deliverable_versions/i)
  })

  /**
   * RLS, on the tenant transaction the application actually uses. Organisation
   * B sees nothing of A's — not the deliverable, not its versions, not who
   * approved what.
   */
  it('shows one organisation nothing of another’s', async () => {
    const seen = await withTenant({ organizationId: orgB.id }, async (tx) => {
      const deliverable = await tx.execute(sql`SELECT id FROM deliverables`)
      const versions = await tx.execute(sql`SELECT id FROM deliverable_versions`)
      const reviews = await tx.execute(sql`SELECT id FROM deliverable_reviews`)
      return {
        deliverables: deliverable.rows.length,
        versions: versions.rows.length,
        reviews: reviews.rows.length,
      }
    })

    expect(seen).toEqual({ deliverables: 0, versions: 0, reviews: 0 })
  })

  it('shows an organisation its own', async () => {
    const count = await withTenant({ organizationId: orgA.id }, async (tx) => {
      const rows = await tx.execute(sql`SELECT id FROM deliverables`)
      return rows.rows.length
    })
    expect(count).toBeGreaterThan(0)
  })

  /**
   * The current-version pointer and the row it names are written together. A
   * pointer at a row that does not exist is a detail page that 500s, and a
   * rollback must leave neither behind (ADR-013).
   */
  it('rolls the pointer back with the version it names', async () => {
    const before = await currentVersionOf(deliverableA)

    await expect(
      withTenant({ organizationId: orgA.id }, async (tx) => {
        const id = newId()
        await tx.execute(sql`
          INSERT INTO deliverable_versions
            (id, organization_id, deliverable_id, version, external_url)
          VALUES (${id}, ${orgA.id}, ${deliverableA}, 7, 'https://example.test/v7')
        `)
        await tx.execute(sql`
          UPDATE deliverables SET current_version_id = ${id} WHERE id = ${deliverableA}
        `)
        throw new Error('rolled back on purpose')
      }),
    ).rejects.toThrow('rolled back on purpose')

    expect(await currentVersionOf(deliverableA)).toBe(before)
    const { rows } = await query('SELECT id FROM deliverable_versions WHERE version = 7')
    expect(rows).toHaveLength(0)
  })

  /**
   * The deliverable types are a SHARED reference table: readable by everyone,
   * writable by nobody but their owner (ADR-010).
   */
  it('shares the system deliverable types and lets nobody rewrite them', async () => {
    const readable = await withTenant({ organizationId: orgB.id }, async (tx) => {
      const rows = await tx.execute(
        sql`SELECT code FROM deliverable_types WHERE organization_id IS NULL`,
      )
      return rows.rows.length
    })
    expect(readable).toBeGreaterThan(0)

    // A tenant cannot rewrite a row that belongs to no tenant: the UPDATE
    // policy matches on organization_id, so the row is simply not there to
    // update — zero rows changed, not an error.
    const changed = await withTenant({ organizationId: orgB.id }, async (tx) => {
      const result = await tx.execute(sql`
        UPDATE deliverable_types SET code = 'hijacked' WHERE organization_id IS NULL
      `)
      return result.rowCount
    })
    expect(changed).toBe(0)
  })

  /** Deleting a deliverable takes its versions and its reviews with it. */
  it('cascades a delete to versions and reviews', async () => {
    const doomed = await seedDeliverable(orgA.id, projectA, 'À supprimer')
    const version = await seedVersion(orgA.id, doomed, 1)
    await query(
      `INSERT INTO deliverable_reviews
         (id, organization_id, deliverable_id, version_id, scope, decision)
       VALUES ($1, $2, $3, $4, 'internal', 'approved')`,
      [newId(), orgA.id, doomed, version],
    )

    await query('DELETE FROM deliverables WHERE id = $1', [doomed])

    const versions = await query('SELECT id FROM deliverable_versions WHERE deliverable_id = $1', [
      doomed,
    ])
    const reviews = await query('SELECT id FROM deliverable_reviews WHERE deliverable_id = $1', [
      doomed,
    ])
    expect(versions.rows).toHaveLength(0)
    expect(reviews.rows).toHaveLength(0)
  })

  async function currentVersionOf(deliverableId: string): Promise<string | null> {
    const { rows } = await query<{ current_version_id: string | null }>(
      'SELECT current_version_id FROM deliverables WHERE id = $1',
      [deliverableId],
    )
    return rows[0]?.current_version_id ?? null
  }
})
