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

export type InvitationTarget = {
  organizationId: string
  role: 'direction' | 'manager' | 'collaborator'
}

export async function invitationByHash(hash: string): Promise<InvitationTarget | null> {
  const rows = await lookupDb()
    .select({ organizationId: invitations.organizationId, role: invitations.role })
    .from(invitations)
    .where(eq(invitations.tokenHash, hash))
    .limit(1)

  const found = rows[0]
  if (!found) return null
  if (found.role === 'owner' || found.role === 'client') return null

  return { organizationId: found.organizationId, role: found.role }
}
