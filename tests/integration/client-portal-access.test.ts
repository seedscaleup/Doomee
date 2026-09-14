import { and, eq } from 'drizzle-orm'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { clientContacts, clientUserAccess, memberships } from '@/db/schema'
import { withTenant } from '@/db/tenant'
import { closeInvitationLookup, invitationByHash } from '@/modules/members/invitation-lookup'
import {
  newId,
  seedOrganization,
  seedUser,
  startTestDatabase,
  type TestDatabase,
} from '../helpers/database'

/**
 * ADR-023 made concrete: ONE person, SEVERAL client accounts, SEVERAL
 * organisations.
 *
 * This is the shape a group or a holding actually has — one contact following
 * three subsidiaries — and it is the shape a naive model breaks on, by putting
 * a UNIQUE on an email or a single client_id on a user. Nothing here is
 * hypothetical: the cost of getting it wrong is a rewrite of the portal's
 * scoping, so it is checked against the real database and real policies.
 */
describe('a client contact across several accounts', () => {
  let db: TestDatabase
  let admin: Client
  let orgA: { id: string }
  let orgB: { id: string }
  let contactUserId: string
  let email: string
  const clientsOfA: string[] = []
  let clientOfB: string

  const query = (text: string, params?: unknown[]) => admin.query(text, params)

  async function seedClient(organizationId: string, name: string, slug: string): Promise<string> {
    const id = newId()
    await query('INSERT INTO clients (id, organization_id, name, slug) VALUES ($1, $2, $3, $4)', [
      id,
      organizationId,
      name,
      slug,
    ])
    await query(
      `INSERT INTO client_contacts (id, organization_id, client_id, name, email)
       VALUES ($1, $2, $3, 'Awa Traoré', $4)`,
      [newId(), organizationId, id, email],
    )
    return id
  }

  /** What acceptInvitation does, against the same policies, without a session. */
  async function grant(organizationId: string, clientId: string): Promise<void> {
    await withTenant({ organizationId }, async (tx) => {
      const existing = await tx
        .select({ id: memberships.id })
        .from(memberships)
        .where(
          and(
            eq(memberships.organizationId, organizationId),
            eq(memberships.userId, contactUserId),
          ),
        )
        .limit(1)

      if (existing.length === 0) {
        await tx.insert(memberships).values({
          id: newId(),
          organizationId,
          userId: contactUserId,
          role: 'client',
          status: 'active',
          joinedAt: new Date(),
        })
      }

      await tx
        .insert(clientUserAccess)
        .values({ id: newId(), organizationId, clientId, userId: contactUserId })
        .onConflictDoNothing()

      await tx
        .update(clientContacts)
        .set({ userId: contactUserId })
        .where(
          and(
            eq(clientContacts.organizationId, organizationId),
            eq(clientContacts.clientId, clientId),
            eq(clientContacts.email, email),
          ),
        )
    })
  }

  beforeAll(async () => {
    db = await startTestDatabase()
    admin = new Client({ connectionString: db.adminUrl })
    await admin.connect()

    email = `awa-${newId()}@example.test`
    contactUserId = await seedUser(query, email)

    orgA = await seedOrganization(query, 'holding-a')
    orgB = await seedOrganization(query, 'holding-b')

    clientsOfA.push(await seedClient(orgA.id, 'Filiale 1', 'filiale-1'))
    clientsOfA.push(await seedClient(orgA.id, 'Filiale 2', 'filiale-2'))
    clientOfB = await seedClient(orgB.id, 'Groupe X', 'groupe-x')

    await grant(orgA.id, clientsOfA[0] as string)
    await grant(orgA.id, clientsOfA[1] as string)
    await grant(orgB.id, clientOfB)
  }, 180_000)

  afterAll(async () => {
    await admin?.end()
    await db?.stop()
  })

  it('holds one membership per organisation, not one per client account', async () => {
    const { rows } = await query(
      'SELECT organization_id FROM memberships WHERE user_id = $1 AND role = $2',
      [contactUserId, 'client'],
    )
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((row) => row.organization_id))).toEqual(new Set([orgA.id, orgB.id]))
  })

  it('accumulates one access per client account', async () => {
    const inA = await withTenant({ organizationId: orgA.id }, (tx) =>
      tx
        .select({ clientId: clientUserAccess.clientId })
        .from(clientUserAccess)
        .where(eq(clientUserAccess.userId, contactUserId)),
    )

    expect(new Set(inA.map((row) => row.clientId))).toEqual(new Set(clientsOfA))
  })

  it('never lets one organisation see the accesses granted by another', async () => {
    // The whole point of app.client_ids being a list scoped to the ACTIVE
    // organisation: from B, the accesses granted in A do not exist.
    const fromB = await withTenant({ organizationId: orgB.id }, (tx) =>
      tx
        .select({ clientId: clientUserAccess.clientId })
        .from(clientUserAccess)
        .where(eq(clientUserAccess.userId, contactUserId)),
    )

    expect(fromB.map((row) => row.clientId)).toEqual([clientOfB])
  })

  it('links the contact row of each account to the same user', async () => {
    const { rows } = await query(
      'SELECT organization_id, client_id FROM client_contacts WHERE user_id = $1',
      [contactUserId],
    )
    expect(rows).toHaveLength(3)
  })

  it('granting the same access twice changes nothing', async () => {
    await grant(orgA.id, clientsOfA[0] as string)

    const { rows } = await query(
      'SELECT count(*)::int AS n FROM client_user_access WHERE user_id = $1',
      [contactUserId],
    )
    expect(rows[0]?.n).toBe(3)
  })
})

/**
 * The token decides the SCOPE, so a malformed pairing must not resolve at all.
 * This is the one pre-tenant read in the product: it is worth pinning.
 */
describe('invitation lookup refuses a scope that makes no sense', () => {
  let db: TestDatabase
  let admin: Client
  let org: { id: string }
  let clientId: string

  const query = (text: string, params?: unknown[]) => admin.query(text, params)

  async function seedInvitation(role: string, withClient: boolean): Promise<string> {
    const hash = `hash-${newId()}`
    await query(
      `INSERT INTO invitations (id, organization_id, client_id, email, role, token_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, now() + interval '7 days')`,
      [newId(), org.id, withClient ? clientId : null, `x-${newId()}@example.test`, role, hash],
    )
    return hash
  }

  beforeAll(async () => {
    db = await startTestDatabase()
    admin = new Client({ connectionString: db.adminUrl })
    await admin.connect()

    // The lookup runs on its own connection, before any tenant context exists,
    // and reads it from the environment like the server does.
    process.env.DATABASE_URL = db.appUrl
    process.env.DATABASE_AUTH_URL = db.adminUrl
    process.env.AUTH_SECRET ??= 'integration-secret-that-is-at-least-32-characters'
    process.env.APP_URL ??= 'http://127.0.0.1:3100'

    org = await seedOrganization(query, 'scope')
    clientId = newId()
    await query('INSERT INTO clients (id, organization_id, name, slug) VALUES ($1, $2, $3, $4)', [
      clientId,
      org.id,
      'Groupe X',
      'groupe-x',
    ])
  }, 180_000)

  afterAll(async () => {
    // The lookup holds its own pool; releasing it before the container stops
    // keeps the shutdown quiet.
    await closeInvitationLookup()
    await admin?.end()
    await db?.stop()
  })

  it('resolves a client invitation that names its account', async () => {
    const found = await invitationByHash(await seedInvitation('client', true))
    expect(found).toEqual({ organizationId: org.id, role: 'client', clientId })
  })

  it('refuses a client invitation with no account to open', async () => {
    expect(await invitationByHash(await seedInvitation('client', false))).toBeNull()
  })

  it('refuses an internal invitation carrying a client scope', async () => {
    expect(await invitationByHash(await seedInvitation('manager', true))).toBeNull()
  })

  it('refuses an owner invitation outright', async () => {
    expect(await invitationByHash(await seedInvitation('owner', false))).toBeNull()
  })
})
