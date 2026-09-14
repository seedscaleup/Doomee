'use server'

import { and, eq, sql } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import { auditLogs, memberships, organizations, subscriptions } from '@/db/schema'
import { withTenant } from '@/db/tenant'
import { setActiveOrganization } from '@/lib/auth/session-store'
import { AppError } from '@/lib/errors/app-error'
import { defineAction, requireSession } from '@/server'
import {
  type CreateOrganizationInput,
  createOrganizationSchema,
  updateOrganizationSchema,
} from './schemas'
import { disambiguateSlug } from './service'

const MAX_SLUG_ATTEMPTS = 5

/**
 * Bootstraps an organisation for a user who has none yet.
 *
 * NOT a defineAction, and deliberately so: defineAction resolves an actor from
 * an existing membership, which by definition does not exist here. There is no
 * privilege bypass either — the organisation id is generated first and used as
 * the tenant context, so the row level security WITH CHECK is satisfied the
 * ordinary way. The caller can only ever create an organisation they own.
 */
export async function createOrganization(raw: CreateOrganizationInput) {
  const session = await requireSession()
  const parsed = createOrganizationSchema.safeParse(raw)

  if (!parsed.success) {
    throw new AppError('validation_failed', 'errors.validation_failed')
  }
  const input = parsed.data

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const organizationId = uuidv7()
    const slug = disambiguateSlug(input.slug, attempt)

    try {
      return await withTenant({ organizationId }, async (db) => {
        await db.insert(organizations).values({
          id: organizationId,
          name: input.name,
          slug,
          defaultLocale: input.defaultLocale,
          timezone: input.timezone,
          defaultCurrency: input.defaultCurrency,
        })

        await db.insert(memberships).values({
          id: uuidv7(),
          organizationId,
          userId: session.userId,
          role: 'owner',
          status: 'active',
          joinedAt: new Date(),
        })

        await db.insert(subscriptions).values({ id: uuidv7(), organizationId })

        await db.insert(auditLogs).values({
          id: uuidv7(),
          organizationId,
          actorUserId: session.userId,
          action: 'organization.created',
          entityType: 'organization',
          entityId: organizationId,
          after: { name: input.name, slug },
        })

        return { id: organizationId, slug }
      }).then(async (created) => {
        // The session must land in the organisation it just created, otherwise
        // the very next page resolves no actor and 403s.
        await setActiveOrganization(session.userId, created.id)
        return created
      })
    } catch (error) {
      if (isSlugConflict(error)) continue
      throw error
    }
  }

  throw new AppError('conflict', 'errors.slug_taken')
}

function isSlugConflict(error: unknown): boolean {
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error
  const code = (cause as { code?: string } | undefined)?.code
  const constraint = (cause as { constraint?: string } | undefined)?.constraint
  return code === '23505' && constraint?.includes('slug') === true
}

export const updateOrganization = defineAction({
  input: updateOrganizationSchema,
  permission: 'organization.update',
  handler: async (input, { actor, db, audit }) => {
    const [updated] = await db
      .update(organizations)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(organizations.id, actor.organizationId))
      .returning({ id: organizations.id, name: organizations.name })

    if (!updated) throw new AppError('not_found', 'errors.not_found')

    await audit({
      action: 'organization.updated',
      entityType: 'organization',
      entityId: actor.organizationId,
      after: input,
    })

    return updated
  },
})

/** Active members, for the seat check. Counted inside the tenant transaction. */
export async function countActiveMembers(organizationId: string): Promise<number> {
  const rows = await withTenant({ organizationId }, (db) =>
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(memberships)
      .where(and(eq(memberships.organizationId, organizationId), eq(memberships.status, 'active'))),
  )
  return rows[0]?.count ?? 0
}
