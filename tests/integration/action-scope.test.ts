import { sql } from 'drizzle-orm'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { withTenant } from '@/db/tenant'
import {
  newId,
  seedOrganization,
  seedUser,
  startTestDatabase,
  type TestDatabase,
} from '../helpers/database'

/**
 * An action is readable when its PROJECT is (ADR-038), and a comment is
 * readable when its action is.
 *
 * The end-to-end suite proves the chain through HTTP. This pins the predicates
 * against real policies — including the two failure modes that would not show
 * up in a happy-path test: a comment leaking from a project the reader is not
 * on, and a cross-tenant row planted through a child table.
 */
describe('what a collaborator may read below a project', () => {
  let db: TestDatabase
  let admin: Client
  let org: { id: string }
  let other: { id: string }
  let collaboratorId: string
  let sharedProject: string
  let reservedProject: string
  let foreignAction: string

  const query = (text: string, params?: unknown[]) => admin.query(text, params)

  async function seedProject(organizationId: string, name: string): Promise<string> {
    const id = newId()
    await query('INSERT INTO projects (id, organization_id, name) VALUES ($1, $2, $3)', [
      id,
      organizationId,
      name,
    ])
    return id
  }

  async function seedAction(
    organizationId: string,
    projectId: string,
    title: string,
  ): Promise<string> {
    const id = newId()
    await query(
      'INSERT INTO actions (id, organization_id, project_id, title) VALUES ($1, $2, $3, $4)',
      [id, organizationId, projectId, title],
    )
    return id
  }

  /** The predicate queries.ts builds, run as app_user under RLS. */
  async function visibleActions(organizationId: string, userId: string): Promise<string[]> {
    const rows = await withTenant({ organizationId }, (tx) =>
      tx.execute(sql`
        SELECT a.title FROM actions a
         WHERE a.deleted_at IS NULL
           AND EXISTS (
             SELECT 1 FROM project_members pm
              WHERE pm.project_id = a.project_id AND pm.user_id = ${userId}
           )
         ORDER BY a.title
      `),
    )
    return (rows.rows as { title: string }[]).map((row) => row.title)
  }

  beforeAll(async () => {
    db = await startTestDatabase()
    admin = new Client({ connectionString: db.adminUrl })
    await admin.connect()

    org = await seedOrganization(query, 'action-a')
    other = await seedOrganization(query, 'action-b')

    collaboratorId = await seedUser(query, `collab-${newId()}@example.test`)
    await query(
      'INSERT INTO memberships (id, organization_id, user_id, role) VALUES ($1, $2, $3, $4)',
      [newId(), org.id, collaboratorId, 'collaborator'],
    )

    sharedProject = await seedProject(org.id, 'Partagé')
    reservedProject = await seedProject(org.id, 'Réservé')
    const foreignProject = await seedProject(other.id, 'Ailleurs')

    await seedAction(org.id, sharedProject, 'Tâche partagée')
    await seedAction(org.id, reservedProject, 'Tâche réservée')
    foreignAction = await seedAction(other.id, foreignProject, 'Tâche étrangère')

    await query(
      'INSERT INTO project_members (id, organization_id, project_id, user_id) VALUES ($1, $2, $3, $4)',
      [newId(), org.id, sharedProject, collaboratorId],
    )
  }, 180_000)

  afterAll(async () => {
    await admin?.end()
    await db?.stop()
  })

  it('shows the actions of the project they are on, and no others', async () => {
    expect(await visibleActions(org.id, collaboratorId)).toEqual(['Tâche partagée'])
  })

  it('shows nothing in an organisation they have no membership in', async () => {
    expect(await visibleActions(other.id, collaboratorId)).toEqual([])
  })

  it('refuses an action pointing at another tenant’s project', async () => {
    // The composite foreign key, not a code review, is what makes this
    // impossible: an action must name its project's OWN organisation.
    await expect(
      query(
        'INSERT INTO actions (id, organization_id, project_id, title) VALUES ($1, $2, $3, $4)',
        [
          newId(),
          org.id,
          // A project that belongs to the other organisation.
          (await query('SELECT id FROM projects WHERE organization_id = $1 LIMIT 1', [other.id]))
            .rows[0]?.id,
          'Intruse',
        ],
      ),
    ).rejects.toThrow(/actions_org_project_fk|foreign key/i)
  })

  it('refuses a comment attached across the tenant boundary', async () => {
    await expect(
      withTenant({ organizationId: org.id }, (tx) =>
        tx.execute(sql`
          INSERT INTO comments (id, organization_id, entity_type, entity_id, body)
          VALUES (${newId()}, ${other.id}, 'action', ${foreignAction}, 'Fuite')
        `),
      ),
    ).rejects.toThrow()
  })

  it('follows a membership added, and drops it when removed', async () => {
    await query(
      'INSERT INTO project_members (id, organization_id, project_id, user_id) VALUES ($1, $2, $3, $4)',
      [newId(), org.id, reservedProject, collaboratorId],
    )
    expect(await visibleActions(org.id, collaboratorId)).toEqual([
      'Tâche partagée',
      'Tâche réservée',
    ])

    await query('DELETE FROM project_members WHERE project_id = $1 AND user_id = $2', [
      reservedProject,
      collaboratorId,
    ])
    expect(await visibleActions(org.id, collaboratorId)).toEqual(['Tâche partagée'])
  })
})

/**
 * A comment is internal unless someone says otherwise — checked at the column,
 * not only in the form (rule 2).
 */
describe('the comment visibility default', () => {
  let db: TestDatabase
  let admin: Client
  let org: { id: string }

  const query = (text: string, params?: unknown[]) => admin.query(text, params)

  beforeAll(async () => {
    db = await startTestDatabase()
    admin = new Client({ connectionString: db.adminUrl })
    await admin.connect()
    org = await seedOrganization(query, 'visibility')
  }, 180_000)

  afterAll(async () => {
    await admin?.end()
    await db?.stop()
  })

  it('is internal when nobody chose', async () => {
    const id = newId()
    // Inserted without naming `visibility` at all — the path a forgotten field,
    // a migration script or a future job would take.
    await query(
      `INSERT INTO comments (id, organization_id, entity_type, entity_id, body)
       VALUES ($1, $2, 'action', $3, 'Sans choix')`,
      [id, org.id, newId()],
    )

    const { rows } = await query('SELECT visibility FROM comments WHERE id = $1', [id])
    expect((rows[0] as { visibility: string }).visibility).toBe('internal')
  })

  it('is internal on an action too, and on a project', async () => {
    const { rows } = await query(
      `SELECT column_default FROM information_schema.columns
        WHERE table_name = 'comments' AND column_name = 'visibility'`,
    )
    expect(String((rows[0] as { column_default: string }).column_default)).toContain('internal')
  })
})
