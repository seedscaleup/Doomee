import 'server-only'

import { and, eq } from 'drizzle-orm'
import { memberships, organizations, users } from '@/db/schema'
import { withTenant, withUserLookup } from '@/db/tenant'
import { defineQuery } from '@/server'

export type OrganizationSummary = {
  id: string
  name: string
  slug: string
  defaultLocale: 'fr' | 'en'
  timezone: string
  defaultCurrency: string
}

/** The active organisation. Read inside the tenant transaction, so RLS applies. */
export const getActiveOrganization = defineQuery({
  permission: 'organization.read_settings',
  handler: async (_input: undefined, { actor, db }) => {
    const rows = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        defaultLocale: organizations.defaultLocale,
        timezone: organizations.timezone,
        defaultCurrency: organizations.defaultCurrency,
      })
      .from(organizations)
      .where(eq(organizations.id, actor.organizationId))
      .limit(1)

    return rows[0] ?? null
  },
})

export type MembershipOption = {
  organizationId: string
  name: string
  slug: string
  role: string
}

/**
 * The organisations a user may switch into.
 *
 * Deliberately NOT a defineQuery: it spans tenants by nature, so there is no
 * single organisation context to open. withUserLookup runs it under the
 * narrow policies of migration 0003, which return the caller's own membership
 * rows and nothing else.
 */
export async function listMembershipsForUser(userId: string): Promise<MembershipOption[]> {
  return withUserLookup(userId, (db) =>
    db
      .select({
        organizationId: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
      .where(and(eq(memberships.userId, userId), eq(memberships.status, 'active')))
      .orderBy(organizations.name),
  )
}

export type Colleague = { userId: string; name: string; email: string; role: string }

export const listColleagues = defineQuery({
  permission: 'member.read',
  handler: async (_input: undefined, { db }) => {
    return db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.status, 'active'))
  },
})

/** Used by the invitation flow to detect an existing member before inviting. */
export async function findMembership(organizationId: string, userId: string) {
  const rows = await withTenant({ organizationId }, (db) =>
    db
      .select({ id: memberships.id, role: memberships.role, status: memberships.status })
      .from(memberships)
      .where(and(eq(memberships.organizationId, organizationId), eq(memberships.userId, userId)))
      .limit(1),
  )
  return rows[0] ?? null
}
