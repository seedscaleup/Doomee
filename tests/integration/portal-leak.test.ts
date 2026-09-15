import { sql } from 'drizzle-orm'
import { Client, type QueryResultRow } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedSystemData } from '@/db/seed'
import { withPortal } from '@/db/tenant'
import { newId, seedOrganization, startTestDatabase, type TestDatabase } from '../helpers/database'

/**
 * ============================================================================
 * THE PORTAL LEAK SUITE (CLAUDE.md §10).
 *
 * For every exposed surface: no internal row, no other client's row, no other
 * organisation's row, and nothing whose `is_client_visible` is false.
 *
 * The fixture is built to make a leak visible rather than possible-in-theory.
 * Everything exists in THREE copies:
 *
 *   · the client the portal session is for   → must be visible
 *   · another client of the SAME organisation → must not
 *   · a client of ANOTHER organisation        → must not
 *
 * and, within the visible client, a shared copy and an internal copy of each
 * thing. A query that forgets a clause fails here rather than in production.
 * ============================================================================
 */

/** Columns no portal view may ever expose, whatever the table (ADR-025, R13). */
const FORBIDDEN_COLUMNS = new Set([
  'health_score',
  'health_status',
  'health_computed_at',
  'budget_amount',
  'budget_currency',
  'spent_minutes',
  'estimated_minutes',
  'blocked_reason',
  'account_team_note',
  'actions_overdue',
  'open_risks_count',
  'deliverables_pending_client',
  // A client receives a signed link minted after a permission check, never the
  // key of an object in the bucket (R13).
  'storage_key',
  'checksum',
  // Identity and internals of `users`.
  'email',
  'email_verified',
  'is_platform_admin',
  'last_seen_at',
  // Bookkeeping that says who inside the agency did what.
  'created_by',
  'updated_by',
  'owner_user_id',
  'assignee_id',
  'recorded_by',
  'uploaded_by',
  'granted_by',
  'reviewer_user_id',
  'is_client_visible',
  'deleted_at',
])

describe('the client portal leaks nothing', () => {
  let db: TestDatabase
  let admin: Client

  let orgA: { id: string }
  let orgB: { id: string }
  let contact: string
  let clientVisible: string
  let clientOther: string
  let clientForeign: string

  /** The visible client's shared world — everything here must be readable. */
  const seen: Record<string, string> = {}
  /** The visible client's INTERNAL world — shared with nobody. */
  const hidden: Record<string, string> = {}
  /** Another client of the SAME organisation, everything shared with THEM. */
  const otherClient: Record<string, string> = {}
  /** Another organisation entirely. */
  const foreign: Record<string, string> = {}

  const query = <R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) =>
    admin.query<R>(text, params)

  /** Reads a portal view exactly as the application does. */
  const asPortal = <T>(run: (tx: Parameters<Parameters<typeof withPortal>[1]>[0]) => Promise<T>) =>
    withPortal({ organizationId: orgA.id, clientIds: [clientVisible], userId: contact }, run)

  async function idsIn(view: string): Promise<string[]> {
    const rows = await asPortal((tx) => tx.execute(sql.raw(`SELECT id FROM portal.${view}`)))
    return (rows.rows as { id: string }[]).map((row) => row.id)
  }

  beforeAll(async () => {
    db = await startTestDatabase()
    admin = new Client({ connectionString: db.adminUrl })
    await admin.connect()
    await seedSystemData(db.adminUrl)

    orgA = await seedOrganization((t, p) => query(t, p), 'portal-a')
    orgB = await seedOrganization((t, p) => query(t, p), 'portal-b')

    contact = await seedUser('contact@example.test')
    const staff = await seedUser('staff@example.test')
    await query(
      `INSERT INTO memberships (id, organization_id, user_id, role, status)
       VALUES ($1, $2, $3, 'client', 'active'), ($4, $2, $5, 'manager', 'active')`,
      [newId(), orgA.id, contact, newId(), staff],
    )

    clientVisible = await seedClient(orgA.id, 'Client visible')
    clientOther = await seedClient(orgA.id, 'Autre client')
    clientForeign = await seedClient(orgB.id, 'Client étranger')

    await query(
      'INSERT INTO client_user_access (id, organization_id, user_id, client_id) VALUES ($1,$2,$3,$4)',
      [newId(), orgA.id, contact, clientVisible],
    )

    // Four worlds, each kept separately so a failing test can say WHICH one
    // leaked rather than just "too many rows".
    await buildWorld(orgA.id, clientVisible, seen, true)
    await buildWorld(orgA.id, clientOther, otherClient, true)
    await buildWorld(orgB.id, clientForeign, foreign, true)
    await buildWorld(orgA.id, clientVisible, hidden, false)
  }, 240_000)

  afterAll(async () => {
    await admin?.end()
    await db?.stop()
  })

  async function seedUser(email: string): Promise<string> {
    const id = newId()
    await query('INSERT INTO users (id, email, name) VALUES ($1, $2, $3)', [id, email, email])
    return id
  }

  async function seedClient(organizationId: string, name: string): Promise<string> {
    const id = newId()
    await query('INSERT INTO clients (id, organization_id, name, slug) VALUES ($1, $2, $3, $4)', [
      id,
      organizationId,
      name,
      `${name}-${id}`,
    ])
    return id
  }

  /**
   * One project and one of everything hanging off it.
   *
   * `shared` drives every `is_client_visible` at once, so the internal copy is
   * internal all the way down rather than internal at the top and shared three
   * joins later.
   */
  async function buildWorld(
    organizationId: string,
    clientId: string,
    into: Record<string, string>,
    shared: boolean,
  ): Promise<void> {
    const projectId = newId()
    await query(
      `INSERT INTO projects (id, organization_id, client_id, name, code, timezone, is_client_visible)
       VALUES ($1, $2, $3, 'Projet', $4, 'Africa/Abidjan', $5)`,
      [projectId, organizationId, clientId, `P-${projectId}`, shared],
    )
    into.projects = projectId

    const milestoneId = newId()
    await query(
      `INSERT INTO milestones (id, organization_id, project_id, title, is_client_visible)
       VALUES ($1, $2, $3, 'Jalon', $4)`,
      [milestoneId, organizationId, projectId, shared],
    )
    into.milestones = milestoneId

    const objectiveId = newId()
    await query(
      `INSERT INTO objectives (id, organization_id, project_id, title, is_client_visible)
       VALUES ($1, $2, $3, 'Objectif', $4)`,
      [objectiveId, organizationId, projectId, shared],
    )
    into.objectives = objectiveId

    const actionId = newId()
    await query(
      `INSERT INTO actions (id, organization_id, project_id, title, is_client_visible)
       VALUES ($1, $2, $3, 'Action', $4)`,
      [actionId, organizationId, projectId, shared],
    )
    into.actions = actionId

    const deliverableId = newId()
    await query(
      `INSERT INTO deliverables (id, organization_id, project_id, title, status, is_client_visible)
       VALUES ($1, $2, $3, 'Livrable', 'client_review', $4)`,
      [deliverableId, organizationId, projectId, shared],
    )
    into.deliverables = deliverableId

    const versionId = newId()
    await query(
      `INSERT INTO deliverable_versions (id, organization_id, deliverable_id, version, external_url)
       VALUES ($1, $2, $3, 1, 'https://example.test/v1')`,
      [versionId, organizationId, deliverableId],
    )
    into.deliverable_versions = versionId

    const reviewId = newId()
    await query(
      `INSERT INTO deliverable_reviews
         (id, organization_id, deliverable_id, version_id, scope, decision, comment)
       VALUES ($1, $2, $3, $4, 'internal', 'approved', 'Avis interne confidentiel')`,
      [reviewId, organizationId, deliverableId, versionId],
    )
    into.deliverable_reviews = reviewId

    const resultId = newId()
    await query(
      `INSERT INTO results (id, organization_id, project_id, recorded_for, is_client_visible)
       VALUES ($1, $2, $3, current_date, $4)`,
      [resultId, organizationId, projectId, shared],
    )
    into.results = resultId

    const noteId = newId()
    await query(
      `INSERT INTO result_notes (id, organization_id, result_id, kind, body)
       VALUES ($1, $2, $3, 'observation', 'Note')`,
      [noteId, organizationId, resultId],
    )
    into.result_notes = noteId

    const commentId = newId()
    await query(
      `INSERT INTO comments
         (id, organization_id, entity_type, entity_id, project_id, client_id, body, visibility)
       VALUES ($1, $2, 'project', $3, $3, $4, 'Commentaire', $5)`,
      [commentId, organizationId, projectId, clientId, shared ? 'shared' : 'internal'],
    )
    into.comments = commentId

    const fileId = newId()
    await query(
      `INSERT INTO files
         (id, organization_id, storage_key, filename, mime_type, size_bytes, is_client_visible)
       VALUES ($1, $2, $3, 'doc.pdf', 'application/pdf', 10, $4)`,
      [fileId, organizationId, `key-${fileId}`, shared],
    )
    into.files = fileId

    // A file reaches the portal only by a ROUTE: an attachment on a project the
    // client can see, a version of a deliverable they can see, or their own
    // logo. Attaching it here is what a real upload does, so the fixture
    // exercises the rule instead of sidestepping it (ADR-062).
    const attachmentId = newId()
    await query(
      `INSERT INTO attachments
         (id, organization_id, file_id, entity_type, entity_id, project_id)
       VALUES ($1, $2, $3, 'project', $4, $4)`,
      [attachmentId, organizationId, fileId, projectId],
    )
    into.attachments = attachmentId

    const eventId = newId()
    await query(
      `INSERT INTO activity_events
         (id, organization_id, verb, entity_type, entity_id, client_id, project_id, visibility)
       VALUES ($1, $2, 'project.created', 'project', $3, $4, $3, $5)`,
      [eventId, organizationId, projectId, clientId, shared ? 'shared' : 'internal'],
    )
    into.activity_events = eventId
  }

  /**
   * ==========================================================================
   * BARRIER 3 — the views are the specification of what a client may see.
   * ==========================================================================
   */
  it('runs every portal view with the caller’s rights, never the owner’s', async () => {
    const { rows } = await query<{ viewname: string; options: string[] | null }>(
      `SELECT c.relname AS viewname, c.reloptions AS options
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'portal' AND c.relkind = 'v'
        ORDER BY c.relname`,
    )

    expect(rows.length).toBeGreaterThan(15)
    // security_invoker=false would make the view run as the migrator and
    // silently bypass every policy underneath it — the view would become the
    // ONLY barrier instead of the third one (ADR-026).
    const notInvoker = rows
      .filter((row) => !(row.options ?? []).includes('security_invoker=true'))
      .map((row) => row.viewname)

    expect(notInvoker).toEqual([])
  })

  /**
   * Generated from the catalogue, not from a list someone remembered to
   * update: every column of every portal view is checked against the denylist.
   * Adding `health_score` to a view fails here.
   */
  it('exposes no forbidden column anywhere in the portal schema', async () => {
    const { rows } = await query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'portal' ORDER BY table_name, column_name`,
    )
    expect(rows.length).toBeGreaterThan(50)

    const leaked = rows
      .filter((row) => FORBIDDEN_COLUMNS.has(row.column_name))
      .map((row) => `${row.table_name}.${row.column_name}`)

    expect(leaked).toEqual([])
  })

  /**
   * ==========================================================================
   * BARRIER 2 — rows. Three copies of the world, one of them visible.
   * ==========================================================================
   */
  const EXPOSED = [
    'projects',
    'milestones',
    'objectives',
    'actions',
    'deliverables',
    'deliverable_versions',
    'deliverable_reviews',
    'results',
    'result_notes',
    'comments',
    'files',
    'activity_events',
  ] as const

  it.each(EXPOSED)('portal.%s shows the client’s own shared row', async (view) => {
    expect(await idsIn(view)).toContain(seen[view])
  })

  it.each(EXPOSED)('portal.%s hides what was never shared', async (view) => {
    expect(await idsIn(view)).not.toContain(hidden[view])
  })

  it.each(EXPOSED)('portal.%s shows exactly one row — nobody else’s', async (view) => {
    // The fixture built FOUR worlds. Seeing more than one row means a clause
    // is missing somewhere: another client's, or another organisation's.
    expect(await idsIn(view)).toEqual([seen[view]])
  })

  it.each(EXPOSED)('portal.%s hides another client of the same organisation', async (view) => {
    expect(await idsIn(view)).not.toContain(otherClient[view])
  })

  it.each(EXPOSED)('portal.%s hides another organisation entirely', async (view) => {
    expect(await idsIn(view)).not.toContain(foreign[view])
  })

  /**
   * ==========================================================================
   * THE LEAK THIS SUITE FOUND.
   *
   * `is_client_visible` says "this may be shown to a client", not "to THIS
   * client". The first version of the files policy filtered on the
   * organisation and the flag alone, and one client saw another client's
   * shared files. A file must travel a ROUTE the client can see (ADR-062).
   * ==========================================================================
   */
  it('never shows a shared file that belongs to another client', async () => {
    const visible = await idsIn('files')

    expect(visible).toContain(seen.files)
    // Same organisation, same is_client_visible = true, different client.
    expect(visible).not.toContain(otherClient.files)
    expect(visible).not.toContain(foreign.files)
    expect(visible).not.toContain(hidden.files)
    expect(visible).toEqual([seen.files])
  })

  /** A file with no route at all reaches nobody, flag or no flag. */
  it('never shows an orphan file, even flagged client-visible', async () => {
    const orphan = newId()
    await query(
      `INSERT INTO files
         (id, organization_id, storage_key, filename, mime_type, size_bytes, is_client_visible)
       VALUES ($1, $2, $3, 'orphan.pdf', 'application/pdf', 10, true)`,
      [orphan, orgA.id, `key-${orphan}`],
    )

    expect(await idsIn('files')).not.toContain(orphan)
  })

  it('shows the client their own account and no other', async () => {
    expect(await idsIn('clients')).toEqual([clientVisible])
  })

  it('shows the client their own organisation and no other', async () => {
    expect(await idsIn('organizations')).toEqual([orgA.id])
  })

  /**
   * An internal reviewer's comment is internal, even though the client may
   * legitimately see that a review happened. The row is visible; the column is
   * blanked by the view.
   */
  it('never shows an internal reviewer’s comment', async () => {
    const rows = await asPortal((tx) =>
      tx.execute(sql.raw('SELECT scope, comment FROM portal.deliverable_reviews')),
    )
    expect(rows.rows).toEqual([{ scope: 'internal', comment: null }])
  })

  /**
   * ==========================================================================
   * BARRIER 1 — the portal cannot name a base table at all.
   * ==========================================================================
   */
  /**
   * Tables the portal has NO grant on at all. Naming one is refused outright —
   * not filtered to nothing, refused, which is the difference between "there
   * is nothing here" and "you may not ask".
   */
  it.each(['memberships', 'audit_logs', 'invitations', 'subscriptions', 'sessions'])(
    'refuses a portal read of public.%s',
    async (table) => {
      const error = await asPortal((tx) =>
        tx.execute(sql.raw(`SELECT * FROM public.${table}`)),
      ).catch((caught: unknown) => caught)

      expect(causeOf(error)).toMatch(/permission denied/i)
    },
  )

  /**
   * ==========================================================================
   * The column grants, tried from the outside.
   *
   * `security_invoker` makes the views run with app_portal's own rights, so
   * app_portal HOLDS a grant on the base columns the views select — and on
   * nothing else (ADR-061). Reading an exposed column directly therefore
   * works, and gives exactly what the view gives; reading an internal one is
   * refused whatever the shape of the query.
   * ==========================================================================
   */
  it('gives the same answer through the base table as through the view', async () => {
    const throughView = await asPortal((tx) =>
      tx.execute(sql.raw('SELECT id FROM portal.projects ORDER BY id')),
    )
    const throughTable = await asPortal((tx) =>
      tx.execute(sql.raw('SELECT id FROM public.projects ORDER BY id')),
    )

    // Same rows: RLS is what filters, and it applies to both.
    expect(throughTable.rows).toEqual(throughView.rows)
    expect(throughTable.rows).toEqual([{ id: seen.projects }])
  })

  it.each([
    ['projects', 'health_score'],
    ['projects', 'health_status'],
    ['projects', 'budget_amount'],
    ['actions', 'spent_minutes'],
    ['actions', 'blocked_reason'],
    ['actions', 'assignee_id'],
    ['clients', 'account_team_note'],
    ['files', 'storage_key'],
    ['users', 'email'],
    ['users', 'is_platform_admin'],
  ])('refuses public.%s.%s in a select list', async (table, column) => {
    const error = await asPortal((tx) =>
      tx.execute(sql.raw(`SELECT ${column} FROM public.${table}`)),
    ).catch((caught: unknown) => caught)

    expect(causeOf(error)).toMatch(/permission denied/i)
  })

  /**
   * The inference route, closed. An ungranted column is refused in a WHERE
   * clause too — otherwise a health score could be read one comparison at a
   * time without ever appearing in a result set.
   */
  it.each([
    ['projects', 'health_score > 0'],
    ['actions', 'spent_minutes > 0'],
    ['users', "email LIKE 'a%'"],
  ])('refuses public.%s filtered on an internal column', async (table, predicate) => {
    const error = await asPortal((tx) =>
      tx.execute(sql.raw(`SELECT id FROM public.${table} WHERE ${predicate}`)),
    ).catch((caught: unknown) => caught)

    expect(causeOf(error)).toMatch(/permission denied/i)
  })

  /** `SELECT *` expands to every column, so it is refused everywhere. */
  it.each(['projects', 'actions', 'clients', 'deliverables', 'results', 'users'])(
    'refuses SELECT * on public.%s',
    async (table) => {
      const error = await asPortal((tx) =>
        tx.execute(sql.raw(`SELECT * FROM public.${table}`)),
      ).catch((caught: unknown) => caught)

      expect(causeOf(error)).toMatch(/permission denied/i)
    },
  )

  /** The health score is the one number ADR-025 keeps out of the portal entirely. */
  it('cannot reach the health score through the view either', async () => {
    const error = await asPortal((tx) =>
      tx.execute(sql.raw('SELECT health_score FROM portal.projects')),
    ).catch((caught: unknown) => caught)

    expect(causeOf(error)).toMatch(/does not exist|permission denied/i)
  })

  /**
   * ==========================================================================
   * WRITES — the two doors, and everything that is not a door.
   * ==========================================================================
   */
  it('lets a client post a shared comment on their own project', async () => {
    const id = newId()
    await asPortal((tx) =>
      tx.execute(sql`
        INSERT INTO public.comments
          (id, organization_id, entity_type, entity_id, project_id, client_id,
           author_user_id, body, visibility)
        VALUES (${id}, ${orgA.id}, 'project', ${seen.projects}, ${seen.projects},
                ${clientVisible}, ${contact}, 'Merci !', 'shared')
      `),
    )

    expect(await idsIn('comments')).toContain(id)
  })

  /** An internal comment is not a client's to write. */
  it('refuses a client comment that claims to be internal', async () => {
    const error = await asPortal((tx) =>
      tx.execute(sql`
        INSERT INTO public.comments
          (id, organization_id, entity_type, entity_id, project_id, client_id,
           author_user_id, body, visibility)
        VALUES (${newId()}, ${orgA.id}, 'project', ${seen.projects}, ${seen.projects},
                ${clientVisible}, ${contact}, 'En douce', 'internal')
      `),
    ).catch((caught: unknown) => caught)

    expect(causeOf(error)).toMatch(/row-level security/i)
  })

  /** Nor is somebody else's name theirs to sign with. */
  it('refuses a client comment attributed to another user', async () => {
    const error = await asPortal((tx) =>
      tx.execute(sql`
        INSERT INTO public.comments
          (id, organization_id, entity_type, entity_id, project_id, client_id,
           author_user_id, body, visibility)
        VALUES (${newId()}, ${orgA.id}, 'project', ${seen.projects}, ${seen.projects},
                ${clientVisible}, ${newId()}, 'Signé par un autre', 'shared')
      `),
    ).catch((caught: unknown) => caught)

    expect(causeOf(error)).toMatch(/row-level security/i)
  })

  /** Nor another client's project. */
  it('refuses a client comment on a project that is not theirs', async () => {
    const error = await asPortal((tx) =>
      tx.execute(sql`
        INSERT INTO public.comments
          (id, organization_id, entity_type, entity_id, project_id, client_id,
           author_user_id, body, visibility)
        VALUES (${newId()}, ${orgA.id}, 'project', ${hidden.projects}, ${hidden.projects},
                ${clientOther}, ${contact}, 'Chez le voisin', 'shared')
      `),
    ).catch((caught: unknown) => caught)

    expect(causeOf(error)).toMatch(/row-level security/i)
  })

  it('lets a client decide on a deliverable that was sent to them', async () => {
    await asPortal((tx) =>
      tx.execute(sql`
        INSERT INTO public.deliverable_reviews
          (id, organization_id, deliverable_id, version_id, scope, decision, reviewer_user_id)
        VALUES (${newId()}, ${orgA.id}, ${seen.deliverables}, ${seen.deliverable_versions},
                'client', 'approved', ${contact})
      `),
    )

    await asPortal((tx) =>
      tx.execute(sql`
        UPDATE public.deliverables SET status = 'approved', approved_by = ${contact},
               approved_at = now()
         WHERE id = ${seen.deliverables}
      `),
    )

    const { rows } = await query<{ status: string }>(
      'SELECT status FROM deliverables WHERE id = $1',
      [seen.deliverables],
    )
    expect(rows[0]?.status).toBe('approved')
  })

  /**
   * A client cannot record an INTERNAL review. That would let them forge the
   * agency's own verdict on their own file.
   */
  it('refuses a client review that claims to be internal', async () => {
    const error = await asPortal((tx) =>
      tx.execute(sql`
        INSERT INTO public.deliverable_reviews
          (id, organization_id, deliverable_id, version_id, scope, decision, reviewer_user_id)
        VALUES (${newId()}, ${orgA.id}, ${seen.deliverables}, ${seen.deliverable_versions},
                'internal', 'approved', ${contact})
      `),
    ).catch((caught: unknown) => caught)

    expect(causeOf(error)).toMatch(/row-level security/i)
  })

  /** And cannot publish: `published` is the agency's decision, never the client's. */
  it('refuses a client trying to publish a deliverable', async () => {
    const id = newId()
    await query(
      `INSERT INTO deliverables (id, organization_id, project_id, title, status, is_client_visible)
       VALUES ($1, $2, $3, 'À publier', 'client_review', true)`,
      [id, orgA.id, seen.projects],
    )

    const error = await asPortal((tx) =>
      tx.execute(sql`UPDATE public.deliverables SET status = 'published' WHERE id = ${id}`),
    ).catch((caught: unknown) => caught)

    expect(causeOf(error)).toMatch(/row-level security/i)
  })

  /** Nor rename it, nor un-share it: the column grant stops the statement dead. */
  it('refuses a client touching any other column of a deliverable', async () => {
    const error = await asPortal((tx) =>
      tx.execute(sql`
        UPDATE public.deliverables SET is_client_visible = false WHERE id = ${seen.deliverables}
      `),
    ).catch((caught: unknown) => caught)

    expect(causeOf(error)).toMatch(/permission denied/i)
  })

  it.each(['projects', 'results', 'objectives', 'actions', 'files'])(
    'refuses a client writing to public.%s at all',
    async (table) => {
      const error = await asPortal((tx) =>
        tx.execute(sql.raw(`DELETE FROM public.${table}`)),
      ).catch((caught: unknown) => caught)

      expect(causeOf(error)).toMatch(/permission denied/i)
    },
  )

  /**
   * A view is not a writable surface here, and nobody should discover that by
   * finding out that it was.
   */
  it('refuses a write through a portal view', async () => {
    const error = await asPortal((tx) =>
      tx.execute(sql.raw(`UPDATE portal.projects SET name = 'Renommé'`)),
    ).catch((caught: unknown) => caught)

    expect(causeOf(error)).toMatch(/permission denied|cannot update/i)
  })

  /**
   * The multi-account case (ADR-023): a contact covering two client accounts
   * sees BOTH — and still nothing of the third.
   */
  it('shows a multi-account contact each of their accounts, and no more', async () => {
    const both = await withPortal(
      { organizationId: orgA.id, clientIds: [clientVisible, clientOther], userId: contact },
      (tx) => tx.execute(sql.raw('SELECT id FROM portal.clients ORDER BY id')),
    )

    const ids = (both.rows as { id: string }[]).map((row) => row.id).sort()
    expect(ids).toEqual([clientVisible, clientOther].sort())
    expect(ids).not.toContain(clientForeign)
  })

  /**
   * The clause that matters most, tried directly: naming another organisation's
   * client id in the context does NOT reach its rows, because every policy is
   * ANDed with the organisation as well.
   */
  it('cannot reach another organisation by naming its client id', async () => {
    const rows = await withPortal(
      { organizationId: orgA.id, clientIds: [clientForeign], userId: contact },
      (tx) => tx.execute(sql.raw('SELECT id FROM portal.projects')),
    )
    expect(rows.rows).toEqual([])
  })
})

/** Drizzle wraps driver errors; the message that says WHY is on the cause. */
function causeOf(error: unknown): string {
  if (!(error instanceof Error)) return `not an error: ${String(error)}`
  const cause = (error as { cause?: { message?: string } }).cause
  return cause?.message ?? error.message
}
