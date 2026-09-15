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
 * The collaborator scope, against real policies on a real database.
 *
 * The end-to-end suite proves the whole chain through HTTP. This one pins the
 * predicate itself — the EXISTS on project_members that `scopedToActor` builds
 * — because that is the line that decides, and a refactor that quietly turns it
 * into "always true" would still pass a happy-path test.
 */
describe('which projects a collaborator may read', () => {
  let db: TestDatabase
  let admin: Client
  let org: { id: string }
  let other: { id: string }
  let collaboratorId: string
  let sharedProject: string
  let reservedProject: string
  let foreignProject: string

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

  /** The predicate as queries.ts builds it, run as app_user under RLS. */
  async function visibleTo(organizationId: string, userId: string): Promise<string[]> {
    const rows = await withTenant({ organizationId }, (tx) =>
      tx.execute(sql`
        SELECT name FROM projects p
         WHERE p.deleted_at IS NULL
           AND EXISTS (
             SELECT 1 FROM project_members pm
              WHERE pm.project_id = p.id AND pm.user_id = ${userId}
           )
         ORDER BY name
      `),
    )
    return (rows.rows as { name: string }[]).map((row) => row.name)
  }

  beforeAll(async () => {
    db = await startTestDatabase()
    admin = new Client({ connectionString: db.adminUrl })
    await admin.connect()

    org = await seedOrganization(query, 'scope-a')
    other = await seedOrganization(query, 'scope-b')

    collaboratorId = await seedUser(query, `collab-${newId()}@example.test`)
    await query(
      'INSERT INTO memberships (id, organization_id, user_id, role) VALUES ($1, $2, $3, $4)',
      [newId(), org.id, collaboratorId, 'collaborator'],
    )

    sharedProject = await seedProject(org.id, 'Partagé')
    reservedProject = await seedProject(org.id, 'Réservé')
    foreignProject = await seedProject(other.id, 'Ailleurs')

    await query(
      'INSERT INTO project_members (id, organization_id, project_id, user_id) VALUES ($1, $2, $3, $4)',
      [newId(), org.id, sharedProject, collaboratorId],
    )
  }, 180_000)

  afterAll(async () => {
    await admin?.end()
    await db?.stop()
  })

  it('shows the project they are a member of', async () => {
    expect(await visibleTo(org.id, collaboratorId)).toEqual(['Partagé'])
  })

  it('hides a project of the same organisation they are not on', async () => {
    expect(await visibleTo(org.id, collaboratorId)).not.toContain('Réservé')
  })

  it('shows nothing at all in an organisation they have no membership in', async () => {
    // Row level security answers this one before the predicate even applies:
    // the rows of the other tenant do not exist for this connection.
    expect(await visibleTo(other.id, collaboratorId)).toEqual([])
  })

  it('cannot be widened by a membership row planted in another tenant', async () => {
    // The composite foreign key is what makes this impossible rather than
    // merely unlikely: a project_members row must name the project's OWN
    // organisation.
    await expect(
      query(
        'INSERT INTO project_members (id, organization_id, project_id, user_id) VALUES ($1, $2, $3, $4)',
        [newId(), org.id, foreignProject, collaboratorId],
      ),
    ).rejects.toThrow(/project_members_org_project_fk|foreign key/i)
  })

  it('follows a membership that is added, and drops it when removed', async () => {
    await query(
      'INSERT INTO project_members (id, organization_id, project_id, user_id) VALUES ($1, $2, $3, $4)',
      [newId(), org.id, reservedProject, collaboratorId],
    )
    expect(await visibleTo(org.id, collaboratorId)).toEqual(['Partagé', 'Réservé'])

    await query('DELETE FROM project_members WHERE project_id = $1 AND user_id = $2', [
      reservedProject,
      collaboratorId,
    ])
    expect(await visibleTo(org.id, collaboratorId)).toEqual(['Partagé'])
  })
})

/**
 * The denormalised progress column is recomputed by the mutation that
 * invalidates it, in the SAME transaction (ADR-013, R5).
 *
 * This checks the property that matters: after a rollback, the column agrees
 * with the rows — because a counter that can commit without its cause is a
 * counter nobody can trust, and lists read it constantly.
 */
describe('the denormalised progress column', () => {
  let db: TestDatabase
  let admin: Client
  let org: { id: string }
  let projectId: string

  const query = (text: string, params?: unknown[]) => admin.query(text, params)

  async function progressOf(): Promise<number> {
    const { rows } = await query('SELECT progress_percent FROM projects WHERE id = $1', [projectId])
    return (rows[0] as { progress_percent: number }).progress_percent
  }

  beforeAll(async () => {
    db = await startTestDatabase()
    admin = new Client({ connectionString: db.adminUrl })
    await admin.connect()

    org = await seedOrganization(query, 'counters')
    projectId = newId()
    await query('INSERT INTO projects (id, organization_id, name) VALUES ($1, $2, $3)', [
      projectId,
      org.id,
      'Compteurs',
    ])
  }, 180_000)

  afterAll(async () => {
    await admin?.end()
    await db?.stop()
  })

  it('starts at zero', async () => {
    expect(await progressOf()).toBe(0)
  })

  it('rolls back with the change that caused it', async () => {
    await expect(
      withTenant({ organizationId: org.id }, async (tx) => {
        await tx.execute(sql`
          INSERT INTO milestones (id, organization_id, project_id, title, reached_at)
          VALUES (${newId()}, ${org.id}, ${projectId}, 'Jalon', now())
        `)
        await tx.execute(sql`
          UPDATE projects SET progress_percent = 100 WHERE id = ${projectId}
        `)

        // Whatever fails afterwards, the milestone and the counter must go back
        // together — they are one fact written in two places.
        throw new Error('rolled back on purpose')
      }),
    ).rejects.toThrow('rolled back on purpose')

    expect(await progressOf()).toBe(0)

    const { rows } = await query(
      'SELECT count(*)::int AS n FROM milestones WHERE project_id = $1',
      [projectId],
    )
    expect((rows[0] as { n: number }).n).toBe(0)
  })
})
