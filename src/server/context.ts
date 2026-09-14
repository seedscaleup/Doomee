import 'server-only'

import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { memberships, users } from '@/db/schema'
import { withTenant } from '@/db/tenant'
import { isLocale } from '@/i18n/routing'
import { auth } from '@/lib/auth/config'
import { AppError } from '@/lib/errors/app-error'
import type { Actor } from '@/lib/permissions'

/**
 * Resolves WHO is acting and WHICH tenant they are acting in.
 *
 * The organisation comes from the session, never from the URL or a request
 * parameter (docs/architecture.md §6.2): an organisation id a user can type is
 * an organisation id a user can change.
 *
 * This runs in the Node server layer, not in middleware — middleware-based
 * authorisation is bypassable, so it only does locale routing (D1).
 */
export type Session = {
  userId: string
  activeOrganizationId: string | null
}

export async function getSession(): Promise<Session | null> {
  // headers() FIRST, deliberately. During static generation it throws the
  // bail-out Next uses to mark a route dynamic; resolving auth() before it
  // would hit environment validation during `next build` instead, and fail the
  // build for a page that is inherently per-request anyway.
  const requestHeaders = await headers()
  const result = await auth().api.getSession({ headers: requestHeaders })
  if (!result?.session) return null

  const active = (result.session as { activeOrganizationId?: string | null }).activeOrganizationId

  return { userId: result.session.userId, activeOrganizationId: active ?? null }
}

/**
 * For pages: an anonymous visitor gets sent to sign-in, not a 500.
 *
 * Layouts and pages render in parallel in the App Router, so a page that throws
 * on a missing session can lose the race against its layout's redirect. Pages
 * call this; server actions call requireSession, where throwing is correct.
 */
export async function requirePageSession(locale: string): Promise<Session> {
  const session = await getSession()
  if (!session) redirect(`/${locale}/sign-in`)
  return session
}

export async function requireSession(): Promise<Session> {
  const session = await getSession()
  if (!session) throw new AppError('unauthenticated', 'errors.unauthenticated')
  return session
}

/**
 * The actor for the active organisation.
 *
 * Membership is read through withTenant, so even this lookup is subject to row
 * level security: a session pointing at an organisation the user does not
 * belong to resolves to nothing, not to a partial actor.
 */
export async function requireActor(): Promise<Actor> {
  const session = await requireSession()

  if (!session.activeOrganizationId) {
    throw new AppError('forbidden', 'errors.no_active_organization')
  }

  const organizationId = session.activeOrganizationId

  const rows = await withTenant({ organizationId }, (db) =>
    db
      .select({
        role: memberships.role,
        status: memberships.status,
        locale: users.locale,
        isPlatformAdmin: users.isPlatformAdmin,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(eq(memberships.organizationId, organizationId), eq(memberships.userId, session.userId)),
      )
      .limit(1),
  )

  const membership = rows[0]
  if (membership?.status !== 'active') {
    // 404-shaped, not 403: never confirm that an organisation exists.
    throw new AppError('not_found', 'errors.not_found')
  }

  const locale = isLocale(membership.locale) ? membership.locale : 'fr'

  if (membership.role === 'client') {
    // Client contacts reach the product through the portal, which resolves its
    // own actor with the client ids it is allowed to see (LOT 9).
    throw new AppError('not_found', 'errors.not_found')
  }

  return {
    kind: 'internal',
    userId: session.userId,
    organizationId,
    role: membership.role,
    locale,
    isPlatformAdmin: membership.isPlatformAdmin,
    projectIds: [],
  }
}
