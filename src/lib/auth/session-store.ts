import 'server-only'

import { createHash, randomBytes } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from '@/db/schema'
import { memberships, sessions } from '@/db/schema'
import { serverEnv } from '@/lib/env'

/**
 * Writes to the session row, which app_user cannot touch (identity tables are
 * revoked from it). This uses the auth connection, exactly like Better Auth.
 *
 * Only ONE thing is written here: which organisation the session is acting in.
 * It is stored in the session and never in the URL, so it is not a parameter a
 * user can tamper with (docs/architecture.md §6.2).
 */
let pool: Pool | undefined

function authDb() {
  pool ??= new Pool({
    connectionString: serverEnv().DATABASE_AUTH_URL,
    max: 3,
    application_name: 'doomee-session',
  })
  return drizzle(pool, { schema })
}

/**
 * Switches the active organisation, but only to one the user actually belongs
 * to. The membership check is the whole security of this function: without it,
 * a user could point their session at any tenant.
 */
export async function setActiveOrganization(
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const db = authDb()

  const membership = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.organizationId, organizationId),
        eq(memberships.status, 'active'),
      ),
    )
    .limit(1)

  if (membership.length === 0) return false

  await db
    .update(sessions)
    .set({ activeOrganizationId: organizationId, updatedAt: new Date() })
    .where(eq(sessions.userId, userId))

  return true
}

/** Used right after an invitation is accepted, to land the user in the right tenant. */
export async function clearActiveOrganizationForAll(organizationId: string): Promise<void> {
  const db = authDb()
  await db
    .update(sessions)
    .set({ activeOrganizationId: null })
    .where(eq(sessions.activeOrganizationId, organizationId))
}

/** Invitation tokens: random, and stored only as a hash. */
export function createToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: hashToken(token) }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
