import 'server-only'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from '@/db/schema'
import { invitations } from '@/db/schema'
import { serverEnv } from '@/lib/env'

/**
 * Resolves an invitation token to its organisation, BEFORE any tenant context
 * exists — accepting an invitation is by definition a pre-membership act.
 *
 * Why this is safe:
 *  - the lookup key is the SHA-256 of a 256-bit random token, so it cannot be
 *    guessed or enumerated;
 *  - it returns only the organisation and role the token already encodes,
 *    never any other row;
 *  - everything that follows runs inside withTenant on that organisation.
 *
 * This is the only pre-tenant read in the product besides authentication
 * itself, and it stays in one small file so it remains easy to audit.
 */
let pool: Pool | undefined

function lookupDb() {
  pool ??= new Pool({
    connectionString: serverEnv().DATABASE_AUTH_URL,
    max: 2,
    application_name: 'doomee-invitation',
  })
  return drizzle(pool, { schema })
}

/** Mirrors closeDatabase: a module that owns a pool must be able to release it. */
export async function closeInvitationLookup(): Promise<void> {
  const open = pool
  pool = undefined
  await open?.end()
}

export type InvitationTarget =
  | { organizationId: string; role: 'direction' | 'manager' | 'collaborator'; clientId: null }
  /** A client contact: the invitation names the ONE account it opens. */
  | { organizationId: string; role: 'client'; clientId: string }

export async function invitationByHash(hash: string): Promise<InvitationTarget | null> {
  const rows = await lookupDb()
    .select({
      organizationId: invitations.organizationId,
      role: invitations.role,
      clientId: invitations.clientId,
    })
    .from(invitations)
    .where(eq(invitations.tokenHash, hash))
    .limit(1)

  const found = rows[0]
  if (!found) return null

  // owner is never handed out by invitation: it is held by whoever created the
  // organisation, and transferred deliberately.
  if (found.role === 'owner') return null

  if (found.role === 'client') {
    // A client invitation without a client id would grant a portal role with no
    // scope. Refuse it rather than guess what it was meant to open.
    if (!found.clientId) return null
    return { organizationId: found.organizationId, role: 'client', clientId: found.clientId }
  }

  // Conversely, an internal role must not carry a client scope: that pairing
  // has no meaning and would only be a way to smuggle one.
  if (found.clientId) return null

  return { organizationId: found.organizationId, role: found.role, clientId: null }
}
